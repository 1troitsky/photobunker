/**
 * App PIN v2 storage. Separate from the prototype-only encrypted queue, so
 * production PWA and offline sessions use the same durable IndexedDB record.
 * This is a UI-lock verifier, NOT encrypted-at-rest protection against someone
 * who can copy or edit the entire browser profile.
 */
export type LegacyPin = { salt: string; digest: string; failures: number; until: number }
export type PinV2 = {
  version: 2
  salt: string
  verifier: string
  iterations: number
  length: 6 | 8
  failures: number
  until: number
  lastWall: number
}
export type PinRecord = PinV2 | LegacyPin

const DATABASE = 'photobunker-app-pin-v2'
const STORE = 'records'

async function open(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('pin.storage_failed')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onerror = () => reject(new Error('pin.storage_failed'))
    request.onblocked = () => reject(new Error('pin.storage_failed'))
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

/** Mutation occurs in one strict-durability transaction, across tabs. */
async function transaction<T>(
  scope: string,
  mode: IDBTransactionMode,
  change: (value: PinRecord | undefined) => PinRecord | undefined,
): Promise<T | undefined> {
  const database = await open()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE, mode, { durability: 'strict' })
    const store = tx.objectStore(STORE)
    const request = store.get(scope)
    let output: PinRecord | undefined
    request.onsuccess = () => {
      try {
        output = change(request.result as PinRecord | undefined)
        if (mode === 'readwrite') {
          if (output === undefined) store.delete(scope)
          else store.put(output, scope)
        }
      } catch (error) {
        reject(error)
        tx.abort()
      }
    }
    request.onerror = () => { reject(new Error('pin.storage_failed')); tx.abort() }
    tx.oncomplete = () => { database.close(); resolve(output as T | undefined) }
    tx.onabort = () => { database.close(); reject(new Error('pin.storage_failed')) }
    tx.onerror = () => { database.close(); reject(new Error('pin.storage_failed')) }
  })
}
export const readPin = (scope: string) =>
  transaction<PinRecord>(scope, 'readonly', value => value)
export const writePin = (scope: string, update: (value: PinRecord | undefined) => PinRecord | undefined) =>
  transaction<PinRecord>(scope, 'readwrite', update)
