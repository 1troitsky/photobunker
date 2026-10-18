// U01 regression: generated DEMO media, disposable browser profiles; no real identities.
import { chromium, webkit, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback app URL')
const button = (page, name) => page.getByRole('button', { name, exact: true })
const nav = (page, name) => page.getByRole('navigation').getByRole('link', { name, exact: true })
const rows = page => page.evaluate(async () => (await import('/src/local/photos.ts')).listPhotos())

for (const name of (process.env.UX_BROWSERS ?? 'chromium,webkit').split(',')) {
  const engine = { chromium, webkit }[name]
  if (!engine) throw new Error('Unknown UX browser')
  const directory = await mkdtemp(join(tmpdir(), `photobunker-ux-${name}-`))
  let context, page, photoId
  const errors = [], external = []
  try {
    context = await engine.launchPersistentContext(directory, { headless: true, locale: 'ru-RU', viewport: { width: 390, height: 844 } })
    await context.addInitScript(() => {
      globalThis.qaOffline = false
      Object.defineProperty(navigator, 'onLine', { get: () => !globalThis.qaOffline })
      const fetch = window.fetch.bind(window)
      window.fetch = (...args) => globalThis.qaOffline && String(args[0]).includes('/api/') ? Promise.reject(new TypeError('Synthetic offline')) : fetch(...args)
    })
    page = context.pages()[0]
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.origin !== new URL(origin).origin) external.push(url.origin) })
    await page.goto(origin)
    await expect(page).toHaveURL(`${origin}/camera`)
    await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Задания', 'Сообщения', 'Камера', 'Фото', 'Профиль'])
    await expect(page.getByLabel('Пресет', { exact: true })).toHaveValue('')
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null)
    assert.equal(await page.evaluate(async () => (await import('/src/profiles/store.ts')).profiles.value.length), 0)
    await page.screenshot({ path: join(tmpdir(), `photobunker-ux-${name}-camera.png`), fullPage: true })

    await page.evaluate(() => { globalThis.qaOffline = true; window.dispatchEvent(new Event('offline')) })
    await button(page, 'Попробовать без камеры').click()
    await button(page, 'Снять фото').click()
    await expect.poll(async () => (await rows(page)).length).toBe(1)
    const captured = (await rows(page))[0]; photoId = captured.id
    assert.equal(captured.profile, undefined); assert.equal(captured.assignmentId, undefined); assert.equal(captured.spaceId, undefined)
    assert.equal(captured.uploadRequested, true); assert.equal(captured.retentionSeconds, 1209600)
    assert.ok(captured.shortId); assert.ok(captured.metadata.capturedAt); assert.equal(captured.metadata.location, undefined)
    const hash = await page.evaluate(async id => {
      const { readPhoto } = await import('/src/local/photos.ts')
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await readPhoto(id)).blob.arrayBuffer())))
    }, photoId)
    await page.reload()
    await expect(page).toHaveURL(`${origin}/camera`)
    const reloaded = await page.evaluate(async id => {
      const { readPhoto } = await import('/src/local/photos.ts')
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await readPhoto(id)).blob.arrayBuffer())))
    }, photoId)
    assert.deepEqual(reloaded, hash)
    await expect.poll(async () => (await rows(page))[0]?.uploadRequested, { timeout: 15_000 }).toBe(false)
    await nav(page, 'Фото').click(); await page.locator('.photo-card').click()
    await expect(page.locator('.original-preview img')).toBeVisible()
    assert.equal(await page.evaluate(async () => (await import('/src/profiles/store.ts')).profiles.value.length), 0)

    await nav(page, 'Профиль').click()
    await expect(page.getByText('Постоянный аккаунт ещё не подключён.', { exact: false })).toBeVisible()
    await expect(page.locator('.account-stats strong').first()).toHaveText('1')
    await page.getByLabel('Оформление', { exact: true }).selectOption('light')
    await page.getByLabel('При запуске', { exact: true }).selectOption('/assignments')
    await page.goto(origin)
    await expect(page).toHaveURL(`${origin}/assignments`)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
    await nav(page, 'Профиль').click()
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Профиль', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ path: join(tmpdir(), `photobunker-ux-${name}-profile-light.png`), fullPage: true })
    await page.getByRole('link', { name: /Настройки Язык/ }).click()
    await page.getByRole('button', { name: 'English', exact: true }).click()
    await nav(page, 'Messages').click()
    await expect(page.getByRole('heading', { name: 'Messaging is not connected yet', exact: true })).toBeVisible()
    await nav(page, 'Camera').click(); await page.getByRole('link', { name: 'Camera presets', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/camera/presets`)
    await expect(page.getByRole('heading', { name: 'Camera presets', exact: true })).toBeVisible()
    await page.goto(`${origin}/profiles`)
    await expect(page.getByRole('heading', { name: 'Camera presets', exact: true })).toBeVisible()

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/camera', '/camera/presets', '/assignments', '/messages', '/gallery', '/profile']) {
        const labels = { '/camera': 'Camera', '/assignments': 'Assignments', '/messages': 'Messages', '/gallery': 'Photos', '/profile': 'Profile' }
        if (path === '/camera/presets') { await nav(page, 'Camera').click(); await page.getByRole('link', { name: 'Camera presets', exact: true }).click() }
        else await nav(page, labels[path]).click()
        await expect(page).toHaveURL(`${origin}${path}`)
        await page.waitForLoadState('networkidle')
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow: ${path} at ${width}`)
        const dock = await page.getByRole('navigation').boundingBox()
        assert.ok(dock && dock.x >= -1 && dock.x + dock.width <= width + 1, `Dock outside viewport at ${width}`)
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, [])
    console.log(`${name}: camera-first without presets, offline durable capture, automatic delivery, unchanged original, five-section Dock, preferences/reload, old links and 320–1440px layouts passed`)
  } catch (error) {
    if (page && !page.isClosed()) console.log(name, 'queue states', (await rows(page)).map(({ uploadError, uploadRequested, retentionSeconds, expiresAt }) => ({ uploadError, uploadRequested, retentionSeconds, expiresAt })))
    throw error
  } finally {
    if (page && !page.isClosed() && photoId) await page.evaluate(async id => { try { await (await import('/src/server/api.ts')).deleteServerPhoto(id) } catch {} }, photoId).catch(() => {})
    await context?.close(); await rm(directory, { recursive: true, force: true })
  }
}
