import type { Team } from '../studio/model'

// Private, device-scoped Team cache. Never write Team names, members,
// invitations or descriptions to localStorage or plaintext IndexedDB.
// Pending writes retain their original Workspace revision/Team UUID.
const DATABASE = 'photobunker-team-cache-v1'
type Entry = { key: CryptoKey; iv: Uint8Array; ciphertext: ArrayBuffer }
export type TeamCache = { snapshot: Team[]; pending: Team[] }
const empty = (): TeamCache => ({ snapshot: [], pending: [] })
const enc = new TextEncoder()
const dec = new TextDecoder()
let serial: Promise<unknown> = Promise.resolve()

function database(): Promise<IDBDatabase> {
  if (!indexedDB || !crypto?.subtle) throw new Error('workspace.storage_unavailable')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scopes')
    request.onerror = () => reject(new Error('workspace.storage_unavailable'))
    request.onblocked = () => reject(new Error('workspace.storage_blocked'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}
async function readRow(scope: string): Promise<Entry | undefined> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scopes', 'readonly')
    const request = tx.objectStore('scopes').get(scope)
    tx.oncomplete = () => { db.close(); resolve(request.result as Entry | undefined) }
    tx.onabort = () => { db.close(); reject(new Error('workspace.storage_unavailable')) }
  })
}
async function writeRow(scope: string, value?: Entry) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('scopes', 'readwrite', { durability: 'strict' })
    const store = tx.objectStore('scopes')
    if (value) store.put(value, scope)
    else store.delete(scope)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = () => { db.close(); reject(new Error('workspace.storage_unavailable')) }
  })
}
async function unlock(scope: string): Promise<{ data: TeamCache; key?: CryptoKey }> {
  const row = await readRow(scope)
  if (!row) return { data: empty() }
  if (!row.key || row.key.extractable || row.iv?.length !== 12) throw new Error('workspace.storage_unavailable')
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: row.iv as Uint8Array<ArrayBuffer>, additionalData: enc.encode(scope) },
    row.key, row.ciphertext,
  )
  const parsed = JSON.parse(dec.decode(bytes)) as TeamCache
  if (!Array.isArray(parsed.snapshot) || !Array.isArray(parsed.pending)) throw new Error('workspace.storage_unavailable')
  return { data: parsed, key: row.key }
}
async function seal(scope: string, data: TeamCache, existing?: CryptoKey) {
  const key = existing ?? await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const clear = enc.encode(JSON.stringify(data))
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(scope) }, key, clear,
    )
    await writeRow(scope, { key, iv, ciphertext })
  } finally { clear.fill(0) }
}
export async function readTeamCache(scope: string): Promise<TeamCache> {
  return (await unlock(scope)).data
}
// navigator.locks coordinates multiple tabs. Serial promise handles reentry
// in the same tab on engines without navigator.locks.
export async function mutateTeamCache(scope: string, update: (data: TeamCache) => TeamCache) {
  const execute = async () => {
    const { data, key } = await unlock(scope)
    const next = update(data)
    await seal(scope, next, key)
    return next
  }
  const task = () => navigator.locks?.request
    ? navigator.locks.request('photobunker-team:' + scope, execute)
    : execute()
  const current = serial.then(task, task)
  serial = current.catch(() => {})
  return current
}
export async function eraseTeamCache(owner: string, device?: string) {
  const db = await database()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('scopes', 'readwrite')
    const cursor = tx.objectStore('scopes').openCursor()
    cursor.onsuccess = () => {
      const row = cursor.result
      if (!row) return
      const name = String(row.key)
      if (name.startsWith('team:' + owner + ':') &&
          (!device || name === 'team:' + owner + ':' + device)) row.delete()
      row.continue()
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = () => { db.close(); reject(new Error('workspace.storage_unavailable')) }
  })
}
