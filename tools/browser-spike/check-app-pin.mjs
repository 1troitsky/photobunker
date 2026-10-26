// Real-browser app-PIN regression with an isolated, synthetic local scope.
// It never creates a server account and never touches the owner's browser profile.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]', 'photobunker.orb.local'].includes(new URL(origin).hostname))
  throw new Error('Use a loopback origin')

const browser = await chromium.launch({
  headless: true,
  ...(process.env.APP_CHROME_CHANNEL ? { channel: process.env.APP_CHROME_CHANNEL } : {}),
})
const context = await browser.newContext({ locale: 'ru-RU' })
const first = await context.newPage()
const second = await context.newPage()
const owner = `qa-pin-${crypto.randomUUID()}`
const device = 'qa-device'

async function openScope(page) {
  await page.goto(`${origin}/welcome`)
  return page.evaluate(async ({ owner, device }) => {
    const identity = await import('/src/identity/store.ts')
    await identity.loadIdentity()
    identity.account.value = {
      id: owner,
      publicId: owner,
      fields: {},
      visibility: {},
      revision: 1,
      matrix: { state: 'pending', userId: null },
    }
    identity.deviceId.value = device
    const lock = await import('/src/app/lock.ts')
    await lock.loadAppLock()
    return {
      ready: lock.appLockReady.value,
      locked: lock.appLocked.value,
      enabled: lock.appPinEnabled.value,
    }
  }, { owner, device })
}

try {
  assert.deepEqual(await openScope(first), { ready: true, locked: false, enabled: false })
  await first.evaluate(async () => {
    const lock = await import('/src/app/lock.ts')
    try { await lock.setAppPin('624817') }
    catch (error) {
      const identity = await import('/src/identity/store.ts')
      throw new Error(JSON.stringify({
        code: error instanceof Error ? error.message : 'unknown',
        owner: !!identity.account.value?.id,
        device: !!identity.deviceId.value,
        ready: lock.appLockReady.value,
        locked: lock.appLocked.value,
        failure: lock.appLockFailure.value,
      }))
    }
  })

  assert.deepEqual(await openScope(second), { ready: true, locked: true, enabled: true })
  await second.evaluate(async () => (await import('/src/app/lock.ts')).unlockApp('624817'))

  await second.evaluate(async () => {
    const library = await import('/src/local/library.ts')
    const messages = await import('/src/messages/store.ts')
    library.photos.value = [{ id: 'private-photo', bytes: 1 }]
    messages.messages.value = [{ id: 'private-message', body: 'synthetic private value' }]
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => second.evaluate(async () => {
    const lock = await import('/src/app/lock.ts')
    const library = await import('/src/local/library.ts')
    const messages = await import('/src/messages/store.ts')
    return [lock.appLocked.value, library.photos.value.length, messages.messages.value.length]
  })).toEqual([true, 0, 0])

  await second.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    await (await import('/src/app/lock.ts')).unlockApp('624817')
  })
  await first.evaluate(async () => (await import('/src/app/lock.ts')).lockApp())
  await expect.poll(() => second.evaluate(async () =>
    (await import('/src/app/lock.ts')).appLocked.value)).toBe(true)

  for (const page of [first, second, first]) {
    await page.evaluate(async () => {
      try { await (await import('/src/app/lock.ts')).unlockApp('000000') }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'pin.wrong') throw error
      }
    })
  }
  await first.reload()
  await openScope(first)
  assert.equal(await first.evaluate(async () => {
    try { await (await import('/src/app/lock.ts')).unlockApp('624817') }
    catch (error) { return error instanceof Error ? error.message : '' }
    return ''
  }), 'pin.cooldown')
  assert.equal(await first.evaluate(async () => {
    Date.now = () => 1
    try { await (await import('/src/app/lock.ts')).unlockApp('624817') }
    catch (error) { return error instanceof Error ? error.message : '' }
    return ''
  }), 'pin.clock_rollback')

  await second.reload()
  await openScope(second)
  assert.deepEqual(await second.evaluate(async () => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
    const lock = await import('/src/app/lock.ts')
    await lock.loadAppLock()
    return {
      ready: lock.appLockReady.value,
      locked: lock.appLocked.value,
      failure: lock.appLockFailure.value,
    }
  }), { ready: true, locked: true, failure: true })

  console.log('chromium: app PIN PBKDF2 persistence, background/cross-tab lock, memory cleanup, cooldown, clock rollback and storage fail-closed passed')
} finally {
  await context.close()
  await browser.close()
}
