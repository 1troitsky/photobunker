// Temporary, explicitly unencrypted local app. Never reuse this database for
// the future E2EE outbox. Release builds require an explicit prototype opt-in.
export const localPrototype = import.meta.env.DEV || import.meta.env.VITE_LOCAL_PROTOTYPE === 'true'
export const DATABASE = 'photobunker-local-prototype-v1'
const stores = ['photos', 'originals', 'thumbnails']

export type Capture = { blob: Blob; thumbnail: Blob; width: number; height: number; method: 'image-capture' | 'video-frame' | 'demo' }
import type { PhotoMetadata, Profile } from '../profiles/model'
import { photoCode } from '../profiles/model'
export type Photo = { id: string; createdAt: number; width: number; height: number; bytes: number; mime: string; method: Capture['method']; title: string; note: string; favorite: boolean; remoteRevision?: number; remoteLibraryId?: string; uploadRequested?: boolean; profile?: Profile; shortId?: string; metadata?: PhotoMetadata; category?: string; shot?: string }
export type PhotoChanges = Pick<Photo, 'title' | 'note' | 'favorite'> & Partial<Pick<Photo, 'category' | 'metadata' | 'remoteRevision' | 'remoteLibraryId' | 'uploadRequested'>>

async function open(): Promise<IDBDatabase> {
  if (!localPrototype) throw new DOMException('Local prototype disabled', 'NotSupportedError')
  if (!globalThis.indexedDB) throw new DOMException('Storage unavailable', 'SecurityError')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => stores.forEach(name => request.result.createObjectStore(name))
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new DOMException('Close other app tabs', 'InvalidStateError')) }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      if (blocked) db.close()
      else resolve(db)
    }
  })
}

async function transact<T>(names: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => () => T): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try {
      try { tx = db.transaction(names, mode, { durability: 'strict' }) }
      catch (error) { if (!(error instanceof TypeError)) throw error; tx = db.transaction(names, mode) }
    } catch (error) { db.close(); reject(error); return }
    let result: () => T
    tx.oncomplete = () => { db.close(); try { resolve(result()) } catch (error) { reject(error) } }
    tx.onabort = () => { db.close(); reject(tx.error ?? new DOMException('Aborted', 'AbortError')) }
    tx.onerror = () => { /* Failed requests abort; a request success is not a commit. */ }
    try { result = work(tx) }
    catch (error) { try { tx.abort() } catch { db.close() }; reject(error) }
  })
}

export function listPhotos(): Promise<Photo[]> {
  return transact(['photos'], 'readonly', tx => {
    const request = tx.objectStore('photos').getAll()
    return () => (request.result as Photo[]).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
  })
}

export async function savePhoto(capture: Capture, details?: { profile: Profile; metadata: PhotoMetadata; category: string; shot: string; createdAt: number; libraryId: string }): Promise<Photo> {
  if (!capture.blob.size || capture.blob.size > 64 * 1024 * 1024 || capture.thumbnail.size > 2 * 1024 * 1024 || !capture.width || !capture.height) throw new DOMException('Invalid image size', 'DataError')
  const photo: Photo = { id: crypto.randomUUID(), createdAt: Date.now(), width: capture.width, height: capture.height, bytes: capture.blob.size, mime: capture.blob.type, method: capture.method, title: '', note: '', favorite: false }
  if (details) Object.assign(photo, { profile: details.profile, metadata: details.metadata, category: details.category, shot: details.shot, createdAt: details.createdAt, shortId: photoCode(details.profile.rules.idPrefix), remoteLibraryId: details.libraryId || undefined })
  return transact(stores, 'readwrite', tx => {
    tx.objectStore('photos').add(photo, photo.id)
    tx.objectStore('originals').add(capture.blob, photo.id)
    tx.objectStore('thumbnails').add(capture.thumbnail, photo.id)
    return () => photo
  })
}

export function readPhoto(id: string): Promise<{ photo: Photo; blob: Blob }> {
  return transact(['photos', 'originals'], 'readonly', tx => {
    const photo = tx.objectStore('photos').get(id)
    const blob = tx.objectStore('originals').get(id)
    return () => {
      if (!photo.result || !blob.result) throw new DOMException('Photo not found', 'NotFoundError')
      return { photo: photo.result as Photo, blob: blob.result as Blob }
    }
  })
}

export function readThumbnail(id: string): Promise<Blob> {
  return transact(['thumbnails'], 'readonly', tx => {
    const request = tx.objectStore('thumbnails').get(id)
    return () => { if (!request.result) throw new DOMException('Photo not found', 'NotFoundError'); return request.result as Blob }
  })
}

export function readMetadata(id: string): Promise<Photo | undefined> {
  return transact(['photos'], 'readonly', tx => {
    const request = tx.objectStore('photos').get(id)
    return () => request.result as Photo | undefined
  })
}

export function updatePhoto(id: string, changes: PhotoChanges): Promise<Photo> {
  return transact(['photos'], 'readwrite', tx => {
    const store = tx.objectStore('photos')
    const request = store.get(id)
    let updated: Photo | undefined
    request.onsuccess = () => {
      if (!request.result) { tx.abort(); return }
      const current = request.result as Photo
      if (current.profile && !current.profile.rules.descriptionEditable && (['title', 'note', 'category'] as const).some(field => current[field] && changes[field] !== undefined && current[field] !== changes[field]?.trim())) { tx.abort(); return }
      updated = { ...request.result as Photo, ...changes, title: changes.title.trim().slice(0, 120), note: changes.note.trim().slice(0, 2000), favorite: changes.favorite }
      store.put(updated, id)
    }
    return () => updated!
  })
}

export function deletePhoto(id: string): Promise<void> {
  return transact(stores, 'readwrite', tx => { stores.forEach(name => tx.objectStore(name).delete(id)); return () => undefined })
}

export function clearPhotos(): Promise<void> {
  return transact(stores, 'readwrite', tx => { stores.forEach(name => tx.objectStore(name).clear()); return () => undefined })
}
