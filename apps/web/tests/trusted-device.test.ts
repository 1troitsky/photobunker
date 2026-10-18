// @vitest-environment jsdom
import { webcrypto } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
const entries = new Map<string, unknown>()
vi.mock('../src/crypto/database', () => ({
  get: vi.fn(async (key: string) => entries.get(key)),
  put: vi.fn(async (key: string, value: unknown) => {
    entries.set(key, value)
  }),
  remove: vi.fn(async (key: string) => {
    entries.delete(key)
  }),
}))
vi.mock('../src/identity/store', async () => {
  const { ref } = await import('vue')
  return {
    account: ref({ id: 'synthetic-account' }),
    deviceId: ref('synthetic-device'),
  }
})
import { account, deviceId } from '../src/identity/store'
import { rememberKit, rememberedKit } from '../src/crypto/trusted'
import {
  loadAppLock,
  setAppPin,
  unlockApp,
  lockApp,
  removeAppPin,
  appLocked,
  appPinEnabled,
} from '../src/app/lock'
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  localStorage.clear()
  entries.clear()
  account.value = { id: 'synthetic-account' } as never
  deviceId.value = 'synthetic-device'
})
it('wraps photo recovery material with a nonextractable device key and binds its account/device context', async () => {
  await rememberKit('PB4.synthetic-public-test-only')
  const row = entries.values().next().value as {
    key: CryptoKey
    ciphertext: ArrayBuffer
  }
  expect(row.key.extractable).toBe(false)
  expect(new TextDecoder().decode(row.ciphertext)).not.toContain(
    'PB4.synthetic-public-test-only',
  )
  expect(await rememberedKit()).toBe('PB4.synthetic-public-test-only')
  deviceId.value = 'another-device'
  expect(await rememberedKit()).toBeUndefined()
})
it('rejects modified trusted-device ciphertext', async () => {
  await rememberKit('PB4.synthetic-public-test-only')
  const row = entries.values().next().value as { ciphertext: ArrayBuffer }
  new Uint8Array(row.ciphertext)[0] ^= 1
  await expect(rememberedKit()).rejects.toThrow()
})
it('keeps the optional PIN on the whole application across reload and locks again on background', async () => {
  await setAppPin('624817')
  await loadAppLock()
  expect(appLocked.value).toBe(true)
  await expect(unlockApp('000000')).rejects.toThrow('Неверный PIN')
  expect(appLocked.value).toBe(true)
  await unlockApp('624817')
  expect(appLocked.value).toBe(false)
  lockApp()
  expect(appLocked.value).toBe(true)
  await removeAppPin()
  await loadAppLock()
  expect(appPinEnabled.value).toBe(false)
  expect(appLocked.value).toBe(false)
})
it('persists a cooldown after repeated invalid PIN attempts', async () => {
  await setAppPin('624817')
  await loadAppLock()
  for (let i = 0; i < 5; i++)
    await expect(unlockApp('000000')).rejects.toThrow()
  await loadAppLock()
  await expect(unlockApp('624817')).rejects.toThrow('Подождите 30 секунд')
  expect(appLocked.value).toBe(true)
})
