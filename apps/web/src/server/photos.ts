import * as local from '../local/photos'
import type { Photo, PhotoChanges } from '../local/photos'
import { accessCode, accessLibraryId, belongsToServer, deleteServerPhoto, ensureAccess, ServerError, serverContent, serverPhoto, updateServerPhoto, uploadPhoto } from './api'

export async function readPhoto(id: string): Promise<{ photo: Photo; blob: Blob }> {
  let result: { photo: Photo; blob: Blob } | undefined
  try { result = await local.readPhoto(id) } catch { /* Try the server if no local replica is readable. */ }
  if (result?.photo.remoteLibraryId && accessCode.value && !belongsToServer(result.photo)) result = undefined
  if (result) {
    if (belongsToServer(result.photo)) {
      try { result.photo = await serverPhoto(id) }
      catch (error) {
        if (error instanceof ServerError && error.status < 500 && !(error.status === 404 && result.photo.remoteRevision === undefined)) throw error
      }
    }
    return result
  }
  const photo = await serverPhoto(id)
  return { photo, blob: await serverContent(id, 'original', photo.mime, photo.bytes) }
}
export async function readThumbnail(id: string): Promise<Blob> {
  if (accessCode.value) {
    const meta = await local.readMetadata(id).catch(() => undefined)
    if (meta?.remoteLibraryId && !belongsToServer(meta)) return serverContent(id, 'thumbnail', 'image/jpeg')
  }
  try { return await local.readThumbnail(id) }
  catch (error) { if (!accessCode.value) throw error; return serverContent(id, 'thumbnail', 'image/jpeg') }
}
export async function saveOnServer(id: string): Promise<Photo> {
  const { photo, blob } = await local.readPhoto(id)
  if (photo.remoteLibraryId && !belongsToServer(photo)) throw new ServerError(403)
  const changes = { title: photo.title, note: photo.note, favorite: photo.favorite }
  await local.updatePhoto(id, { ...changes, uploadRequested: true })
  await ensureAccess()
  await local.updatePhoto(id, { ...changes, remoteLibraryId: accessLibraryId.value })
  let result = await uploadPhoto(photo, blob, await local.readThumbnail(id))
  await local.updatePhoto(id, { title: result.title, note: result.note, favorite: result.favorite, remoteRevision: result.remoteRevision, remoteLibraryId: result.remoteLibraryId, uploadRequested: false })
  // Location can improve while the original is uploading. Deliver that sidecar
  // separately; never rewrite the already confirmed original.
  const current = (await local.readPhoto(id)).photo
  if (JSON.stringify(current.metadata ?? {}) !== JSON.stringify(result.metadata ?? {})) {
    result = await updateServerPhoto(result, { title: result.title, note: result.note, favorite: result.favorite, metadata: current.metadata })
  }
  return local.updatePhoto(id, { title: result.title, note: result.note, favorite: result.favorite, metadata: result.metadata, remoteRevision: result.remoteRevision, remoteLibraryId: result.remoteLibraryId, uploadRequested: false })
}
export async function updatePhoto(id: string, changes: PhotoChanges, expectedRevision?: number): Promise<Photo> {
  let current: Photo | undefined
  try { current = (await local.readPhoto(id)).photo } catch { /* Server-only photos need no local replica. */ }
  if (current?.remoteLibraryId && accessCode.value && !belongsToServer(current)) current = undefined
  if (!current || belongsToServer(current) && current.remoteRevision !== undefined) {
    const server = current?.remoteRevision !== undefined ? current : await serverPhoto(id)
    const result = await updateServerPhoto({ ...server, remoteRevision: expectedRevision ?? server.remoteRevision }, changes)
    if (current) return local.updatePhoto(id, { ...changes, remoteRevision: result.remoteRevision })
    return result
  }
  return local.updatePhoto(id, { ...changes, ...(belongsToServer(current) ? {} : { remoteRevision: undefined, remoteLibraryId: undefined }) })
}
export async function deletePhoto(id: string): Promise<void> {
  let current: Photo | undefined
  try { current = (await local.readPhoto(id)).photo } catch { /* May exist only on the server. */ }
  if (current?.remoteLibraryId && accessCode.value && !belongsToServer(current)) { await deleteServerPhoto(id); return }
  if (accessCode.value && (!current || belongsToServer(current))) await deleteServerPhoto(id)
  await local.deletePhoto(id)
}
