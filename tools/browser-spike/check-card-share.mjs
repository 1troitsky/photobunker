// Synthetic payload only. Never log fragment secrets, plaintext card data,
// ciphertext or request bodies.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { origin, button, monitorRuntime } from './account-qa.mjs'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ locale: 'ru-RU' })
const page = await context.newPage()
const errors = [], diagnostics = { nativePhotoPoll: 0 }
let stage = 'prepare', revoked = false, failOnce = false
try {
  await monitorRuntime(page, 'chromium', errors, diagnostics)
  await page.goto(`${origin}/welcome`)
  const fixture = await page.evaluate(async () => {
    const { encryptCard, CARD_ONLY } = await import('/src/crypto/card-shares.ts')
    const expiresAt = Date.now() + 3600_000
    const encrypted = await encryptCard({
      id: crypto.randomUUID(),
      title: 'QA protected card',
      nameId: 'CARD0001',
      namePending: false,
      description: 'Allowed QA description',
      expiresAt,
      capturedAt: Date.now() - 10_000,
      location: { latitude: 41.721, longitude: 44.826 },
      metadata: {
        camera: 'QA camera', width: 320, height: 240, bytes: 2048,
        mime: 'image/jpeg', method: 'demo',
      },
      author: { publicId: 'pb_qa_author' },
    }, { ...CARD_ONLY, metadata: true }, expiresAt, 3600)
    return {
      manifest: encrypted.manifest,
      secret: encrypted.secret,
      bytes: Array.from(new Uint8Array(await encrypted.ciphertext.arrayBuffer())),
    }
  })
  const id = fixture.manifest.id
  const link = `${origin}/c/${id}#${fixture.secret}`
  const paths = []
  page.on('request', request => paths.push(new URL(request.url()).pathname))
  await context.route(`**/api/v1/cards/${id}`, async route => {
    if (revoked) return route.fulfill({ status: 410, body: '' })
    if (failOnce) {
      failOnce = false
      return route.fulfill({ status: 503, body: '' })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture.manifest),
    })
  })
  await context.route(`**/api/v1/cards/${id}/content`, route => route.fulfill({
    status: revoked ? 410 : 200,
    contentType: 'application/octet-stream',
    body: Buffer.from(fixture.bytes),
  }))

  stage = 'anonymous-card'
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Защищённая карточка' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'QA protected card' })).toBeVisible()
  await expect(page.getByText('Дата съёмки', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'pb_qa_author' })).toBeVisible()
  await expect(page.locator('img')).toHaveCount(0)
  await expect(page.locator('nav')).toHaveCount(0)
  assert.equal(new URL(page.url()).hash, '')
  assert.ok(paths.every(path => !path.includes(fixture.secret)))

  stage = 'coordinate-copy'
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => undefined },
  }))
  await button(page, 'Копировать координаты').click()
  await expect(button(page, 'Координаты скопированы')).toBeVisible()

  stage = 'transient-retry'
  failOnce = true
  const retryPage = await context.newPage()
  await monitorRuntime(retryPage, 'chromium', errors, diagnostics)
  await retryPage.goto(link)
  await expect(retryPage.getByRole('heading', { name: 'Ссылка временно недоступна' })).toBeVisible()
  assert.equal(new URL(retryPage.url()).hash, '')
  await button(retryPage, 'Повторить').click()
  await expect(retryPage.getByRole('heading', { name: 'QA protected card' })).toBeVisible()

  stage = 'revoke'
  revoked = true
  await expect.poll(async () => {
    await retryPage.waitForTimeout(1000)
    return retryPage.getByRole('heading', { name: 'Ссылка истекла или отозвана' }).count()
  }, { timeout: 15000 }).toBe(1)
  assert.deepEqual(errors, [])
  console.log('chromium: encrypted public card, fragment isolation, metadata, retry and revoke passed')
} catch (error) {
  console.error({
    stage,
    name: error instanceof Error ? error.name : 'unknown',
    code: error instanceof Error ? error.message.replace(/[^a-z0-9_:-]/gi, '_').slice(0, 120) : 'unknown',
    errors,
    diagnostics,
    headings: await page.getByRole('heading').allTextContents().catch(() => []),
  })
  throw new Error('card_share_qa_failed')
} finally {
  await context.close()
  await browser.close()
}
