// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { accessCode, accessLibraryId, accessSaved, ensureAccess, restoreAccess, uploadPhoto } from '../src/server/api'
import type { Photo } from '../src/local/photos'
beforeEach(() => { localStorage.clear(); accessCode.value = ''; accessLibraryId.value = ''; accessSaved.value = true })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('creates only one anonymous library for simultaneous requests and remembers access', async () => {
  const code = 'a'.repeat(64)
  const fetch = vi.fn(async () => new Response(JSON.stringify({ accessCode: code, libraryId: 'library-a' }), { status: 201 }))
  vi.stubGlobal('fetch', fetch)
  await Promise.all([ensureAccess(), ensureAccess()])
  expect(fetch).toHaveBeenCalledOnce()
  expect(accessCode.value).toBe(code)
  expect(localStorage.getItem('photobunker-prototype-access')).toBe(code)
})
it('validates recovery before replacing existing access and never sends the code in a URL', async () => {
  accessCode.value = 'a'.repeat(64)
  const fetch = vi.fn(async () => new Response('{}', { status: 401 }))
  vi.stubGlobal('fetch', fetch)
  await expect(restoreAccess('b'.repeat(64))).rejects.toThrow()
  expect(accessCode.value).toBe('a'.repeat(64))
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/v1/prototype/photos')
  expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${'b'.repeat(64)}`)
  expect(init.credentials).toBe('omit')
  expect(init.cache).toBe('no-store')
})
it('does not acknowledge upload after a server failure', async () => {
  accessCode.value = 'a'.repeat(64)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
  await expect(uploadPhoto({ id: 'synthetic' } as Photo, new Blob(['original']), new Blob(['thumbnail']))).rejects.toMatchObject({ status: 503 })
})
it('keeps in-memory access and exposes failed preference persistence', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessCode: 'a'.repeat(64), libraryId: 'library-a' }), { status: 201 })))
  await ensureAccess()
  expect(accessCode.value).toHaveLength(64)
  expect(accessSaved.value).toBe(false)
})
