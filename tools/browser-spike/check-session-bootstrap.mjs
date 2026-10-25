// R0-02: isolated synthetic accounts. Never log credentials, keys or private data.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { origin, headers, button, accountFixture, cleanupFixtures } from './account-qa.mjs'

const browser = await chromium.launch({ headless: true })
const fixtures = [], contexts = []
let stage = 'guest-shell', latest
const state = page => page.evaluate(async () => {
  const s = await import('/src/identity/store.ts')
  return { state: s.sessionState.value, local: s.offlineCaptureIdentity.value,
    confirmed: s.hasConfirmedIdentity(), id: s.account.value?.id, device: s.deviceId.value }
})
try {
  const guest = await browser.newContext({ locale: 'ru-RU' })
  contexts.push(guest)
  let releaseGuest
  const heldGuest = new Promise(resolve => { releaseGuest = resolve })
  await guest.route('**/api/v1/identity/me', async route => {
    await heldGuest
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }).catch(() => {})
  })
  const page = await guest.newPage()
  await page.goto(origin + '/profile/account?mode=recover')
  // The server response is still held: visibility cannot depend on its timeout.
  await expect(page.getByLabel('Ключ аккаунта', { exact: true })).toBeVisible()
  await page.goto(origin + '/camera')
  await expect(page.locator('.main-content')).toContainText('Проверяем доступ')
  await expect(page.locator('video')).toHaveCount(0)
  releaseGuest()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/profile')
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/camera')
  console.log('PASS: guest form renders while /me is held; private camera stays gated and preserves its intended route.')

  stage = 'public-share'
  const publicContext = await browser.newContext({ locale: 'ru-RU' })
  contexts.push(publicContext)
  let identityCalls = 0
  publicContext.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/identity/')) identityCalls++
  })
  const publicPage = await publicContext.newPage()
  await publicPage.goto(origin + '/s/00000000-0000-4000-8000-000000000000')
  await expect(publicPage.getByRole('alert')).toBeVisible()
  assert.equal(identityCalls, 0)
  console.log('PASS: public share route opens without Identity bootstrap.')

  stage = 'cookie-restoration'
  const f = await accountFixture(browser, 'R0-02 bootstrap', fixtures)
  latest = f.page
  await f.context.clearCookies()
  await f.page.reload()
  await expect.poll(async () => (await state(f.page)).confirmed).toBe(true)
  const restored = await state(f.page)
  assert.equal(restored.id, f.me.account.id)
  assert.equal(restored.device, f.me.deviceId)
  const devices = await (await f.context.request.get(origin + '/api/v1/identity/devices', { headers })).json()
  assert.equal(devices.devices.length, 1)
  console.log('PASS: missing cookie restores the original registered device without another account or device.')

  stage = 'stable-background-refresh'
  await f.page.goto(origin + '/messages')
  await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-connection', 'ready', { timeout: 60000 })
  await f.page.locator('.messages-screen').evaluate(element => { element.dataset.qaRetained = 'yes' })
  let mode = 'hold', release, requests = 0
  let held = new Promise(resolve => { release = resolve })
  await f.context.route('**/api/v1/identity/me', async route => {
    requests++
    if (mode === 'hold') await held
    if (mode === 'unavailable')
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    return route.continue().catch(() => {})
  })
  await f.page.evaluate(async () => {
    const s = await import('/src/identity/store.ts')
    window.qaSessionRefresh = s.loadIdentity(true)
    void s.loadIdentity(true)
  })
  await expect.poll(() => requests).toBe(1)
  assert.equal((await state(f.page)).confirmed, true)
  await expect(f.page.locator('.messages-screen[data-qa-retained="yes"]')).toBeVisible()
  mode = 'real'; release()
  await f.page.evaluate(() => window.qaSessionRefresh)
  await expect(f.page.locator('.messages-screen[data-qa-retained="yes"]')).toBeVisible()
  assert.equal(requests, 1)
  console.log('PASS: coalesced background refresh keeps the same Messages component mounted.')

  stage = 'scoped-local-start'
  mode = 'hold'
  held = new Promise(resolve => { release = resolve })
  await f.page.goto(origin + '/camera')
  await expect.poll(async () => (await state(f.page)).local).toBe(true)
  const local = await state(f.page)
  assert.equal(local.confirmed, false)
  assert.equal(local.id, f.me.account.id)
  await expect(f.page.locator('.native-camera')).toBeVisible()
  mode = 'unavailable'; release()
  await expect.poll(async () => (await state(f.page)).state).toBe('offline')
  await expect(f.page.locator('.native-camera')).toBeVisible()
  assert.equal((await state(f.page)).id, f.me.account.id)
  mode = 'real'
  await f.page.evaluate(async () => { await (await import('/src/identity/store.ts')).loadIdentity(true) })
  assert.equal((await state(f.page)).confirmed, true)
  console.log('PASS: local camera opens before /me; 503 preserves its scoped context without claiming server authentication, then reconnect confirms it.')

  stage = 'cross-tab-logout'
  const other = await f.context.newPage()
  await other.goto(origin + '/profile')
  await expect(other.locator('.identity-public-id')).toBeVisible()
  await f.page.goto(origin + '/profile')
  await button(f.page, 'Выйти').click()
  await button(f.page, 'Выйти без сохранения').click()
  await expect(other.locator('.identity-public-id')).toHaveCount(0)
  await expect(button(other, 'Создать аккаунт')).toBeVisible()
  console.log('PASS: logout invalidates another tab and keeps old private UI closed.')
} catch (error) {
  console.error(`Session bootstrap failed at ${stage} (${error.name}; ${error.stack?.match(/check-session-bootstrap.mjs:\d+:\d+/)?.[0] ?? ''})`)
  if (latest) console.error(await latest.evaluate(async () => {
    const s = await import('/src/identity/store.ts'), db = await import('/src/crypto/database.ts'), keys = await import('/src/identity/keys.ts')
    const capture = await db.get('capture-current'), devices = await keys.credentials()
    return { state: s.sessionState.value, local: s.offlineCaptureIdentity.value, confirmed: s.hasConfirmedIdentity(),
      savedCapture: !!capture, deviceCount: devices.length, galleryMounted: !!document.querySelector('.gallery-screen') }
  }).catch(() => ({ unavailable: true })))
  throw new Error('session_bootstrap_qa_failed')
} finally {
  for (const context of contexts) await context.close()
  await cleanupFixtures(fixtures)
  await browser.close()
}
