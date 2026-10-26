// Synthetic payload only. Never log fragment secrets, plaintext card data,
// ciphertext or request bodies.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { origin, button, monitorRuntime } from './account-qa.mjs'

const browser = await chromium.launch({ headless: true,
  ...(process.env.APP_CHROME_CHANNEL ? { channel: process.env.APP_CHROME_CHANNEL } : {}) })
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

  stage = 'independent-image-scopes'
  const imageFixture = await page.evaluate(async () => {
    const { encryptCardBundle, CARD_ONLY } = await import('/src/crypto/card-shares.ts')
    const image = async (color, type) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 32
      const context = canvas.getContext('2d')
      context.fillStyle = color
      context.fillRect(0, 0, 32, 32)
      return await new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('encode')), type, .95))
    }
    const expiresAt = Date.now() + 3600_000
    const encrypted = await encryptCardBundle({
      id: crypto.randomUUID(), title: 'QA image card', nameId: 'CARD0002',
      namePending: false, expiresAt,
    }, { ...CARD_ONLY, photo: true, original: true, download: true }, expiresAt, 3600, {
      photo: { versionId: crypto.randomUUID(), blob: await image('#000000', 'image/jpeg') },
      original: await image('#00ff00', 'image/png'),
    })
    const objects = {}
    for (const [kind, blob] of Object.entries(encrypted.objects))
      objects[kind] = Array.from(new Uint8Array(await blob.arrayBuffer()))
    return { manifest: encrypted.manifest, secret: encrypted.secret, objects }
  })
  const imageId = imageFixture.manifest.id
  const imagePaths = []
  await context.route(`**/api/v1/cards/${imageId}`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(imageFixture.manifest),
  }))
  for (const kind of ['card', 'photo', 'original']) {
    const suffix = kind === 'card' ? 'content' : `content/${kind}`
    await context.route(`**/api/v1/cards/${imageId}/${suffix}`, route => route.fulfill({
      status: 200, contentType: 'application/octet-stream', body: Buffer.from(imageFixture.objects[kind]),
    }))
  }
  const imagePage = await context.newPage()
  imagePage.on('request', request => imagePaths.push(new URL(request.url()).pathname))
  await monitorRuntime(imagePage, 'chromium', errors, diagnostics)
  await imagePage.goto(`${origin}/c/${imageId}#${imageFixture.secret}`)
  await expect(imagePage.getByRole('heading', { name: 'QA image card' })).toBeVisible()
  await expect(imagePage.locator('img')).toHaveCount(1)
  assert.ok(!imagePaths.some(path => path.endsWith('/content/original')))
  await expect(button(imagePage, 'Скачать фотографию')).toBeVisible()
  await button(imagePage, 'Открыть оригинал (небезопасно)').click()
  await expect(imagePage.locator('img')).toHaveCount(2)
  await expect(button(imagePage, 'Скачать оригинал')).toBeVisible()
  assert.ok(imagePaths.some(path => path.endsWith('/content/original')))
  assert.ok(imagePaths.every(path => !path.includes(imageFixture.secret)))

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
