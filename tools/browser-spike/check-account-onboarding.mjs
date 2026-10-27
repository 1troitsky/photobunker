// Minimal synthetic regression for the create/recover storage boundary.
// Recovery material is never printed or returned from the browser context.
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium, webkit, expect } from '@playwright/test'
import { origin, headers, button, label, cleanupFixtures, labelQaDevice } from './account-qa.mjs'

const engine = process.env.APP_BROWSER === 'webkit' ? 'webkit' : 'chromium'
const browser = await { chromium, webkit }[engine].launch({ headless: true })
const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const fixtures = []
let kit = '', me

try {
  await page.goto(`${origin}/profile/account`)
  await button(page, 'Создать аккаунт').click()
  kit = await label(page, 'Ключ аккаунта').inputValue()
  assert.ok(kit.startsWith('PB1.'))
  await label(page, 'Я сохранил ключ восстановления').check()
  await button(page, 'Готово').click()
  await expect(page).toHaveURL(`${origin}/profile`, { timeout: 30_000 })
  await labelQaDevice(page, 'QA account onboarding storage')
  me = await (await context.request.get(`${origin}/api/v1/identity/me`, { headers })).json()

  const local = await page.evaluate(async () => {
    const identity = await import('/src/identity/keys.ts')
    const vault = await import('/src/identity/vault.ts')
    const encrypted = await import('/src/crypto/database.ts')
    const devices = await identity.credentials()
    return {
      devices: devices.length,
      nonExtractable: devices.every(device => !device.privateKey.extractable),
      accountKeyRows: (await encrypted.entries('account-key:')).length,
      canReadAccountKey: !!await vault.accountKey(),
    }
  })
  assert.deepEqual(local, {
    devices: 1,
    nonExtractable: true,
    accountKeyRows: 1,
    canReadAccountKey: true,
  })

  // A missing cookie is the ordinary cold-start case on an installed PWA.
  // The saved non-extractable device must re-establish the session without
  // asking the owner for PB1 again.
  await context.clearCookies()
  await page.reload()
  await expect(page.locator('.identity-public-id')).toBeVisible({ timeout: 30_000 })
  await expect.poll(async () =>
    (await context.request.get(`${origin}/api/v1/identity/me`, { headers })).status(),
  { timeout: 30_000 }).toBe(200)

  // Explicit sign-out removes the device credential. The same PB1 must then
  // recover the existing account as a new device through the visible UI.
  await button(page, 'Выйти').click()
  await button(page, 'Выйти без сохранения').click()
  await expect(button(page, 'Войти с ключом аккаунта')).toBeVisible({ timeout: 30_000 })
  await button(page, 'Войти с ключом аккаунта').click()
  await label(page, 'Ключ аккаунта').fill(kit)
  await button(page, 'Готово').click()
  await expect(page).toHaveURL(`${origin}/profile`, { timeout: 30_000 })
  await expect(page.locator('.identity-public-id')).toBeVisible()
  assert.equal((await context.request.get(`${origin}/api/v1/identity/me`, { headers })).status(), 200)
  await labelQaDevice(page, 'QA account onboarding recovered')

  console.log(`${engine}: account creation, saved-device restoration and PB1 recovery all passed`)
} finally {
  if (!me && kit) {
    const response = await context.request.get(`${origin}/api/v1/identity/me`, { headers }).catch(() => undefined)
    if (response?.ok()) me = await response.json()
  }
  if (me && kit) fixtures.push({
    context, page, me,
    fingerprint: createHash('sha256').update(kit.split('.')[1]).digest('hex'),
  })
  if (fixtures.length) {
    process.chdir(fileURLToPath(new URL('../..', import.meta.url)))
    await cleanupFixtures(fixtures)
  }
  else await context.close()
  await browser.close()
}
