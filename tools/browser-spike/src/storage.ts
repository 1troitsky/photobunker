// Dedicated lab origin/database. Never open or migrate the product outbox.
const DATABASE = 'photobunker-i02-synthetic-lab'
const STORES = ['blobs', 'jobs', 'keys']

export function openLab(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => STORES.forEach(name => request.result.createObjectStore(name))
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('storage.blocked'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transaction(db: IDBDatabase, stores: string[], mode: IDBTransactionMode) {
  try { return db.transaction(stores, mode, { durability: 'strict' }) }
  catch (error) {
    if (!(error instanceof TypeError)) throw error
    return db.transaction(stores, mode)
  }
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new DOMException('Aborted', 'AbortError'))
    tx.onerror = () => { /* Transaction abort determines the result. */ }
  })
}

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function sha256(blob: Blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function saveSynthetic() {
  const bytes = new Uint8Array(4 * 1024 * 1024)
  for (let offset = 0; offset < bytes.length; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, offset + 65536))
  // Random nonpersonal bytes model the shape/size of a ciphertext Blob. This
  // is an IDB probe, not a PhotoBunker encryption or encrypted-queue codec.
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const digest = await sha256(blob)
  const db = await openLab()
  try {
    const tx = transaction(db, ['blobs', 'jobs'], 'readwrite')
    const done = completed(tx)
    tx.objectStore('blobs').put(blob, 'committed')
    tx.objectStore('jobs').put({ bytes: blob.size, digest }, 'committed')
    const durability = tx.durability ?? 'unreported'
    await done // A successful put request alone is not a local commit.
    return { bytes: blob.size, requestedDurability: 'strict', observedDurability: durability }
  } finally { db.close() }
}

export async function verifySynthetic() {
  const db = await openLab()
  let blob: Blob | undefined
  let job: { bytes: number; digest: string } | undefined
  try {
    const tx = db.transaction(['blobs', 'jobs'], 'readonly')
    const done = completed(tx)
    ;[blob, job] = await Promise.all([
      requested<Blob | undefined>(tx.objectStore('blobs').get('committed')),
      requested<{ bytes: number; digest: string } | undefined>(tx.objectStore('jobs').get('committed')),
    ])
    await done
  } finally { db.close() }
  if (!blob || !job || blob.size !== job.bytes || await sha256(blob) !== job.digest) throw new Error('storage.readback_failed')
  return { bytes: blob.size, exactBytes: true }
}

export async function abortSynthetic() {
  const db = await openLab()
  try {
    const tx = transaction(db, ['blobs', 'jobs'], 'readwrite')
    const done = completed(tx).then(() => false, () => true)
    const put = tx.objectStore('blobs').put(new Blob([new Uint8Array(1024)]), 'aborted')
    tx.objectStore('jobs').put({ pending: true }, 'aborted')
    put.onsuccess = () => tx.abort() // Abort after request success, before commit.
    if (!await done) throw new Error('storage.abort_did_not_happen')
    const read = db.transaction(['blobs', 'jobs'], 'readonly')
    const readDone = completed(read)
    const values = await Promise.all(['blobs', 'jobs'].map(name => requested(read.objectStore(name).get('aborted'))))
    await readDone
    if (values.some(value => value !== undefined)) throw new Error('storage.partial_commit')
    return { bothRecordsAbsent: true }
  } finally { db.close() }
}

export async function saveUploadKey() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
  const db = await openLab()
  try {
    const tx = transaction(db, ['keys'], 'readwrite')
    const done = completed(tx)
    tx.objectStore('keys').put(keys, 'synthetic-upload-auth')
    await done
    return { privateExtractable: keys.privateKey.extractable }
  } finally { db.close() }
}

export async function verifyUploadKey() {
  const db = await openLab()
  let keys: CryptoKeyPair | undefined
  try {
    const tx = db.transaction(['keys'], 'readonly')
    const done = completed(tx)
    keys = await requested<CryptoKeyPair | undefined>(tx.objectStore('keys').get('synthetic-upload-auth'))
    await done
  } finally { db.close() }
  if (!keys) throw new Error('key.missing')
  const message = new TextEncoder().encode('photobunker/i02/synthetic-proof-only')
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, message)
  const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, signature, message)
  let exportDenied = false
  try { await crypto.subtle.exportKey('pkcs8', keys.privateKey) }
  catch (error) { exportDenied = error instanceof DOMException && error.name === 'InvalidAccessError' }
  if (!verified || !exportDenied || keys.privateKey.extractable || signature.byteLength !== 64) throw new Error('key.capability_failed')
  return { verified, exportDenied, signatureBytes: signature.byteLength }
}

export function clearLab(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('storage.close_other_lab_tabs'))
  })
}
