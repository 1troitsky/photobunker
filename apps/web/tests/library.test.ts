// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { listPhotos } from '../src/local/photos'
import type { Photo } from '../src/local/photos'
import { accessCode, accessLibraryId, listServerPhotos } from '../src/server/api'
import { libraryError, photos, refreshLibrary, serverError } from '../src/local/library'
vi.mock('../src/local/photos', () => ({ localPrototype: true, listPhotos: vi.fn() }))
vi.mock('../src/server/api', async () => { const { ref } = await import('vue'); return { accessCode: ref(''), accessLibraryId: ref(''), listServerPhotos: vi.fn() } })
beforeEach(() => { vi.clearAllMocks(); accessCode.value = 'synthetic-access'; accessLibraryId.value = crypto.randomUUID() })
const photo = { id: 'synthetic', createdAt: 1 } as Photo
it('shows server photos when browser storage is denied', async () => {
  vi.mocked(listPhotos).mockRejectedValue(new DOMException('Denied', 'SecurityError'))
  vi.mocked(listServerPhotos).mockResolvedValue({ photos: [photo], deleted: [] })
  await refreshLibrary()
  expect(photos.value).toEqual([photo])
  expect(libraryError.value).toBe(false)
})
it('keeps local photos and reports an unavailable server', async () => {
  vi.mocked(listPhotos).mockResolvedValue([photo])
  vi.mocked(listServerPhotos).mockRejectedValue(new TypeError('Offline'))
  await refreshLibrary()
  expect(photos.value).toEqual([photo])
  expect(serverError.value).toBe(true)
})
it('hides a local replica after receiving its server tombstone', async () => {
  vi.mocked(listPhotos).mockResolvedValue([{ ...photo, remoteLibraryId: accessLibraryId.value }])
  vi.mocked(listServerPhotos).mockResolvedValue({ photos: [], deleted: [photo.id] })
  await refreshLibrary()
  expect(photos.value).toEqual([])
})
it('does not mix a previous library replica into another restored library', async () => {
  vi.mocked(listPhotos).mockResolvedValue([{ ...photo, remoteLibraryId: 'another-library' }])
  vi.mocked(listServerPhotos).mockResolvedValue({ photos: [], deleted: [] })
  await refreshLibrary()
  expect(photos.value).toEqual([])
})
