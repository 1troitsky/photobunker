import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.unstubAllGlobals() })
it('refuses plaintext storage in a production build without explicit prototype opt-in', async () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_LOCAL_PROTOTYPE', '')
  const open = vi.fn()
  vi.stubGlobal('indexedDB', { open })
  vi.resetModules()
  const { listPhotos, localPrototype } = await import('../src/local/photos')
  expect(localPrototype).toBe(false)
  await expect(listPhotos()).rejects.toThrow('Local prototype disabled')
  expect(open).not.toHaveBeenCalled()
})
