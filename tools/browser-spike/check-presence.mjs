import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  accountFixture,
  cleanupFixtures,
  headers,
  monitorRuntime,
  origin,
} from './account-qa.mjs'

const browser = await chromium.launch({ headless: true })
const fixtures = []
const extra = []
const errors = []
const diagnostics = { nativePhotoPoll: 0 }
let stage = 'accounts'

async function state(viewer, publicId) {
  const response = await viewer.context.request.get(
    `${origin}/api/v1/identity/presence/${publicId}`,
    { headers },
  )
  assert.equal(response.status(), 200)
  return (await response.json()).state
}

async function setVisibility(owner, value) {
  await owner.page.goto(`${origin}/settings`)
  await owner.page.locator('.presence-visibility-select').selectOption(value)
  await expect.poll(async () => {
    const response = await owner.context.request.get(
      `${origin}/api/v1/identity/presence/privacy`,
      { headers },
    )
    return (await response.json()).visibility
  }).toBe(value)
}

try {
  const alice = await accountFixture(browser, 'presence owner', fixtures)
  const bob = await accountFixture(browser, 'presence contact', fixtures)
  const stranger = await accountFixture(browser, 'presence stranger', fixtures)
  for (const fixture of fixtures)
    await monitorRuntime(fixture.page, 'chromium', errors, diagnostics)

  stage = 'default-private'
  await expect.poll(() => state(bob, alice.me.account.publicId)).toBe('hidden')

  stage = 'all-visible'
  await setVisibility(alice, 'all')
  await expect.poll(() => state(bob, alice.me.account.publicId)).toBe('online')
  await expect.poll(() => state(stranger, alice.me.account.publicId)).toBe('online')
  await bob.page.goto(`${origin}/people/${alice.me.account.publicId}`)
  await expect(bob.page.locator('.presence-label')).toHaveText('Онлайн')

  stage = 'offline-clears-ui'
  await bob.context.setOffline(true)
  await expect(bob.page.locator('.presence-label')).toHaveText('Статус недоступен')
  await bob.context.setOffline(false)

  stage = 'mutual-contacts-only'
  await setVisibility(alice, 'contacts')
  assert.equal(await state(bob, alice.me.account.publicId), 'hidden')
  assert.equal(await state(stranger, alice.me.account.publicId), 'hidden')
  assert.equal((await alice.context.request.post(`${origin}/api/v1/identity/contacts`, {
    headers,
    data: { publicId: bob.me.account.publicId },
  })).status(), 200)
  assert.equal((await bob.context.request.post(`${origin}/api/v1/identity/contacts`, {
    headers,
    data: { publicId: alice.me.account.publicId },
  })).status(), 200)
  await expect.poll(() => state(bob, alice.me.account.publicId)).toBe('online')
  assert.equal(await state(stranger, alice.me.account.publicId), 'hidden')

  stage = 'nobody'
  await setVisibility(alice, 'nobody')
  assert.equal(await state(bob, alice.me.account.publicId), 'hidden')
  await setVisibility(alice, 'contacts')

  stage = 'second-device'
  const secondContext = await browser.newContext({
    locale: 'ru-RU',
    viewport: { width: 390, height: 844 },
  })
  extra.push(secondContext)
  const secondPage = await secondContext.newPage()
  await monitorRuntime(secondPage, 'chromium', errors, diagnostics)
  await secondPage.goto(`${origin}/profile`)
  await secondPage.evaluate(async ({ kit }) => {
    const store = await import('/src/identity/store.ts')
    await store.recover(kit, 'QA presence second device')
  }, { kit: alice.kit })
  await secondPage.goto(`${origin}/profile`)
  await expect.poll(() => state(bob, alice.me.account.publicId)).toBe('online')

  await alice.page.evaluate(async () => {
    const store = await import('/src/identity/store.ts')
    await store.logout()
  })
  await expect.poll(() => state(bob, alice.me.account.publicId)).toBe('online')
  await alice.context.close()
  await secondPage.evaluate(async () => {
    const store = await import('/src/identity/store.ts')
    await store.logout()
  })
  await expect.poll(() => state(bob, alice.me.account.publicId)).toBe('recent')

  assert.deepEqual(errors, [])
  console.log('PASS: private presence all/contacts/nobody, offline UI and two-device lease lifecycle.')
} catch (error) {
  const location = error.stack?.match(/check-presence\.mjs:\d+:\d+/)?.[0] ?? ''
  console.error(`Presence QA failed at ${stage} (${error.name}) ${location}.`)
  const owner = fixtures[0]
  if (owner) {
    const response = await owner.context.request.get(
      `${origin}/api/v1/identity/presence/privacy`,
      { headers },
    ).catch(() => undefined)
    console.error({
      serverVisibility: response?.ok() ? (await response.json()).visibility : 'unavailable',
      selectedVisibility: await owner.page.locator('.presence-visibility-select').inputValue().catch(() => 'unavailable'),
      notices: await owner.page.locator('.preference-notice').allTextContents().catch(() => []),
    })
  }
  console.error({ errors, diagnostics })
  throw new Error('presence_qa_failed')
} finally {
  for (const context of extra) await context.close().catch(() => {})
  await cleanupFixtures(fixtures)
  await browser.close()
}
