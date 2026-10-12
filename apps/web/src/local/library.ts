import { computed, shallowRef } from 'vue'
import { listPhotos, localPrototype } from './photos'
import type { Photo } from './photos'

export const photos = shallowRef<Photo[]>([])
export const libraryError = shallowRef(false)
export const libraryLoading = shallowRef(false)
export const usedBytes = computed(() => photos.value.reduce((sum, photo) => sum + photo.bytes, 0))
let generation = 0

export async function refreshLibrary() {
  if (!localPrototype) return
  const current = ++generation
  libraryLoading.value = true
  try { const result = await listPhotos(); if (current === generation) { photos.value = result; libraryError.value = false } }
  catch { if (current === generation) libraryError.value = true }
  finally { if (current === generation) libraryLoading.value = false }
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
  return () => { channel?.close(); channel = undefined; window.removeEventListener('focus', refreshLibrary) }
}
export function libraryChanged() { channel?.postMessage('changed'); void refreshLibrary() }

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
