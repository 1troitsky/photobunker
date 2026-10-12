import { computed, shallowRef } from 'vue'
import { listPhotos, localPrototype } from './photos'
import type { Photo } from './photos'
import { accessCode, accessLibraryId, listServerPhotos } from '../server/api'

export const photos = shallowRef<Photo[]>([])
export const libraryError = shallowRef(false)
export const libraryLoading = shallowRef(false)
export const serverError = shallowRef(false)
export const usedBytes = computed(() => photos.value.reduce((sum, photo) => sum + photo.bytes, 0))
let generation = 0
let cachedRemote: Awaited<ReturnType<typeof listServerPhotos>> | undefined
let cachedLibrary = ''

export async function refreshLibrary() {
  if (!localPrototype) return
  const current = ++generation
  const connected = !!accessCode.value
  const library = accessLibraryId.value
  libraryLoading.value = true
  const [local, remote] = await Promise.allSettled([listPhotos(), connected ? listServerPhotos() : Promise.resolve(undefined)])
  if (current !== generation) return
  serverError.value = connected && remote.status === 'rejected'
  if (remote.status === 'fulfilled' && remote.value) { cachedRemote = remote.value; cachedLibrary = library }
  const server = connected && cachedLibrary === library ? cachedRemote : undefined
  const deleted = new Set(server?.deleted ?? [])
  const merged = new Map((local.status === 'fulfilled' ? local.value : []).filter(photo => (!connected || !photo.remoteLibraryId || photo.remoteLibraryId === library) && !deleted.has(photo.id)).map(photo => [photo.id, photo]))
  for (const photo of server?.photos ?? []) merged.set(photo.id, photo)
  photos.value = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
  libraryError.value = local.status === 'rejected' && !server
  libraryLoading.value = false
}

// Other tabs send only an invalidation hint, never photo bytes or metadata.
let channel: BroadcastChannel | undefined
export function startLibrary() {
  if (localPrototype && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel('photobunker-local-prototype-changes')
    channel.onmessage = () => { void refreshLibrary() }
  }
  void refreshLibrary()
  window.addEventListener('focus', refreshLibrary)
  window.addEventListener('online', refreshLibrary)
  return () => { channel?.close(); channel = undefined; window.removeEventListener('focus', refreshLibrary); window.removeEventListener('online', refreshLibrary) }
}
export function libraryChanged() { channel?.postMessage('changed'); void refreshLibrary() }

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
