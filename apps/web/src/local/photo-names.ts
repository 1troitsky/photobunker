import { account, deviceId, hasConfirmedIdentity, sessionState } from '../identity/store'
import { appLocked } from '../app/lock'
import { identityRequest } from '../identity/api'

export type ReservedName = {
  photoId: string
  code: string
  assignmentId: string | null
  leaseId: string
  number: number
}
type Lease = {
  id: string
  prefix: string
  first: number
  last: number
  next: number
  assignmentId: string | null
}
type State = {
  leases: Lease[]
  photos: ReservedName[]
  requests: Record<string, string>
}
type Row = { key: CryptoKey; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer }
const dbName = 'photobunker-photo-names-v1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const empty = (): State => ({ leases: [], photos: [], requests: {} })
const namePattern = /^[A-Z]{4}[0-9]{4}$/
export const isNameId = (value: unknown): value is string =>
  typeof value === 'string' && namePattern.test(value)
const subject = (assignmentId: string | null) => assignmentId ? 'assignment:' + assignmentId : 'personal'

function scope() {
  if (!account.value?.id || !deviceId.value || appLocked.value ||
      sessionState.value === 'signed-out' || sessionState.value === 'revoked') return ''
  return 'photo-names:' + account.value.id + ':' + deviceId.value
}
function current(key: string) {
  if (!key || key !== scope()) throw new Error('photo_names.account_changed')
}
function open(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle)
    return Promise.reject(new Error('photo_names.storage_unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scopes')
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('photo_names.blocked'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}
async function row(key: string): Promise<Row | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scopes', 'readonly')
    const request = tx.objectStore('scopes').get(key)
    tx.oncomplete = () => { db.close(); resolve(request.result as Row | undefined) }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}
async function put(key: string, value: Row): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scopes', 'readwrite', { durability: 'strict' })
    tx.objectStore('scopes').put(value, key)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}
async function read(key: string): Promise<{ state: State; key?: CryptoKey }> {
  const saved = await row(key)
  current(key)
  if (!saved) return { state: empty() }
  if (saved.key.extractable || saved.iv.byteLength !== 12)
    throw new Error('photo_names.invalid_cache')
  const bytes = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: saved.iv, additionalData: encoder.encode(key),
  }, saved.key, saved.ciphertext)
  current(key)
  const value = JSON.parse(decoder.decode(bytes)) as State
  if (!Array.isArray(value.leases) || !Array.isArray(value.photos) ||
      !value.requests || typeof value.requests !== 'object')
    throw new Error('photo_names.invalid_cache')
  return { state: value, key: saved.key }
}
async function seal(key: string, value: State, old?: CryptoKey) {
  const secureKey = old ?? await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const clear = encoder.encode(JSON.stringify(value))
  try {
    current(key)
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: encoder.encode(key),
    }, secureKey, clear)
    current(key)
    await put(key, { key: secureKey, iv, ciphertext })
    current(key)
  } finally { clear.fill(0) }
}
// Offline allocation needs a cross-tab lock. Where Web Locks API is absent,
// never risk assigning the same reserved number from two tabs.
let serial: Promise<unknown> = Promise.resolve()
async function mutate<T>(key: string, update: (state: State) => T): Promise<T> {
  if (!navigator.locks) throw new Error('photo_names.lock_unavailable')
  const task = () => navigator.locks.request('pb-photo-names:' + key, async () => {
    const { state, key: aes } = await read(key)
    const value = update(state)
    await seal(key, state, aes)
    return value
  })
  const operation = serial.then(task, task)
  serial = operation.catch(() => {})
  return operation
}
export async function localName(photoId: string): Promise<string | undefined> {
  const key = scope()
  if (!key) return
  const value = (await read(key)).state.photos.find(photo => photo.photoId === photoId)
  return value?.code
}
export async function takeName(photoId: string, assignmentId: string | null): Promise<string | undefined> {
  const key = scope()
  if (!key) return
  try {
    return await mutate(key, value => {
      const prior = value.photos.find(row => row.photoId === photoId)
      if (prior) return prior.code
      const lease = value.leases.find(row =>
        row.assignmentId === assignmentId && row.next <= row.last)
      if (!lease) return undefined
      const number = lease.next++
      const code = lease.prefix + String(number).padStart(4, '0')
      value.photos.push({ photoId, code, number, leaseId: lease.id, assignmentId })
      return code
    })
  } catch {
    // A photo is always saved with its UUID; never allocate an unsafe code.
    return undefined
  }
}
const warmJobs = new Map<string, Promise<void>>()
/** Warm on authenticated launch / camera entry; never block taking a photo. */
export function warmNames(assignmentId: string | null = null): Promise<void> {
  const key = scope()
  if (!key || !hasConfirmedIdentity()) return Promise.resolve()
  const group = subject(assignmentId), existing = warmJobs.get(key + ':' + group)
  if (existing) return existing
  const job = (async () => {
    if (!navigator.locks) return
    const requestKey = await mutate(key, value => {
      if (value.leases.some(row => row.assignmentId === assignmentId && row.last - row.next >= 7))
        return ''
      value.requests[group] ||= crypto.randomUUID()
      return value.requests[group]
    })
    if (!requestKey) return
    const response = await identityRequest<{
      id: string; prefix: string; first: number; last: number; assignmentId: string | null
    }>('/photo-names/reserve', 'POST', { requestKey, assignmentId, count: 32 })
    current(key)
    await mutate(key, value => {
      if (value.requests[group] !== requestKey) return
      if (!value.leases.some(row => row.id === response.id))
        value.leases.push({ ...response, next: response.first })
      delete value.requests[group]
    })
  })().finally(() => warmJobs.delete(key + ':' + group))
  warmJobs.set(key + ':' + group, job)
  return job
}
/** Idempotent server binding happens before upload; response loss is safe. */
export async function ensureName(photoId: string, assignmentId: string | null): Promise<string> {
  const key = scope()
  current(key)
  if (!hasConfirmedIdentity()) throw new Error('photo_names.offline')
  // Use the durable pre-consumed number; if no lease was available at capture,
  // server atomically allocates one keyed by this immutable photo UUID.
  const assigned = (await read(key)).state.photos.find(row => row.photoId === photoId)
  const result = await identityRequest<{ photoId: string; code: string }>(
    '/photo-names/claim', 'POST', {
      photoId, assignmentId: assigned?.assignmentId ?? assignmentId,
      ...(assigned ? { leaseId: assigned.leaseId, number: assigned.number } : {}),
    },
  )
  current(key)
  if (result.photoId !== photoId || !isNameId(result.code) ||
      (assigned && assigned.code !== result.code))
    throw new Error('photo_names.conflict')
  if (!assigned) {
    await mutate(key, value => {
      if (!value.photos.some(row => row.photoId === photoId))
        value.photos.push({ photoId, code: result.code, leaseId: '', number: 0, assignmentId })
    })
  }
  return result.code
}
export async function purgeNames(owner: string, device?: string): Promise<void> {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('scopes', 'readwrite')
    const request = tx.objectStore('scopes').openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const id = String(cursor.key)
      if (id.startsWith('photo-names:' + owner + ':') &&
          (!device || id === 'photo-names:' + owner + ':' + device)) cursor.delete()
      cursor.continue()
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}
