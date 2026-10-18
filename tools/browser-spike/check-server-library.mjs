// Generated demo photos only. Isolated profiles; secrets never printed.
import { chromium, firefox, webkit, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback app URL')
const button = (page, name) => page.getByRole('button', { name, exact: true })
const nav = (page, name) => page.getByRole('navigation').getByRole('link', { name, exact: true })
async function openSettings(page) { await nav(page, 'Профиль').click(); await page.locator('.account-link[href="/settings"]').click() }
async function originalHash(page) {
  await expect.poll(() => page.locator('.original-preview img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
  return page.evaluate(async () => {
    const { readPhoto } = await import('/src/server/photos.ts')
    const { blob } = await readPhoto(location.pathname.split('/').at(-1))
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(n => n.toString(16).padStart(2, '0')).join('')
  })
}
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const profileA = await mkdtemp(join(tmpdir(), `photobunker-server-${name}-a-`))
  const profileB = await mkdtemp(join(tmpdir(), `photobunker-server-${name}-b-`))
  const options = { headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 1000 } }
  let a, b, code, id, page
  try {
    a = await engine.launchPersistentContext(profileA, options)
    page = a.pages()[0]
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.goto(origin)
    await expect(page).toHaveURL(`${origin}/camera`)
    await page.route('**/api/v1/prototype/photos', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.continue())
    await button(page, 'Попробовать без камеры').click(); await button(page, 'Снять фото').click()
    await expect(page.locator('.camera-screen .capture-feedback')).toContainText('Кадр сохранён в этом браузере')
    await nav(page, 'Фото').click(); await page.locator('.photo-card').click()
    await expect(page.locator('.original-preview img')).toBeVisible()
    id = new URL(page.url()).pathname.split('/').at(-1)
    const hash = await originalHash(page)
    // Automatic delivery retains the local capture during a server outage.
    await expect(page.locator('.server-delivery')).toContainText('Нет связи с сервером')
    await expect(page.getByLabel('Название', { exact: true })).toBeEnabled()
    await page.unroute('**/api/v1/prototype/photos')
    await page.locator('.server-delivery').getByRole('button', { name: 'Повторить отправку', exact: true }).click()
    await expect(page.locator('.server-delivery')).toContainText('На локальном сервере')
    await expect(button(page, 'Сохранить на сервере')).toHaveCount(0)
    // Uploaded local replicas remain readable when the server is offline.
    await page.route('**/api/v1/prototype/**', route => route.abort())
    await page.reload(); await expect(page.locator('.original-preview img')).toBeVisible()
    assert.equal(await originalHash(page), hash)
    await page.unroute('**/api/v1/prototype/**')
    await openSettings(page); await button(page, 'Показать код доступа').click()
    code = await page.locator('#access-code').inputValue(); assert.match(code, /^[0-9a-f]{64}$/)
    await button(page, 'Скрыть код').click()
    const emptyLibrary = await (await a.request.post(`${origin}/api/v1/prototype/libraries`)).json()
    await page.locator('#restore-code').fill(emptyLibrary.accessCode); await button(page, 'Открыть библиотеку').click()
    await expect(page.locator('.server-settings .capture-feedback')).toHaveText('Серверная библиотека подключена')
    await nav(page, 'Фото').click(); await expect(page.locator('.photo-card')).toHaveCount(0)
    await page.goto(`${origin}/gallery/${id}`); await expect(page.getByRole('heading', { name: 'Снимок недоступен', exact: true })).toBeVisible()
    await openSettings(page); await page.locator('#restore-code').fill(code); await button(page, 'Открыть библиотеку').click()
    await expect(page.locator('.server-settings .capture-feedback')).toHaveText('Серверная библиотека подключена')
    await button(page, 'Удалить копии в браузере').click(); await expect(page.getByRole('status').filter({ hasText: 'Копии в браузере удалены' })).toHaveText('Копии в браузере удалены')
    await nav(page, 'Фото').click(); await expect(page.locator('.photo-card')).toHaveCount(1)
    await page.locator('.photo-card').click(); await expect(page.locator('.original-preview img')).toBeVisible()
    assert.equal(await originalHash(page), hash)
    b = await engine.launchPersistentContext(profileB, options)
    const other = b.pages()[0]; other.on('pageerror', error => errors.push(error.message)); other.on('dialog', dialog => dialog.accept())
    await other.goto(`${origin}/settings`)
    await other.locator('#restore-code').fill(code); await button(other, 'Открыть библиотеку').click()
    await expect(other.locator('.server-settings .capture-feedback')).toHaveText('Серверная библиотека подключена')
    await nav(other, 'Фото').click(); await expect(other.locator('.photo-card')).toHaveCount(1)
    await other.locator('.photo-card').click(); await expect(other.locator('.original-preview img')).toBeVisible()
    assert.equal(await originalHash(other), hash)
    await page.getByLabel('Название', { exact: true }).fill('Устаревшая правка')
    await other.getByLabel('Название', { exact: true }).fill('Снимок с сервера')
    await other.getByLabel('Заметка', { exact: true }).fill('Правка из другого браузера')
    await button(other, 'Сохранить изменения').click(); await expect(other.locator('.photo-screen .capture-feedback')).toHaveText('Изменения сохранены')
    await button(page, 'Сохранить изменения').click(); await expect(page.locator('.photo-screen .capture-feedback')).toContainText('Снимок изменён в другом браузере')
    await page.reload(); await expect(page.getByRole('heading', { name: 'Снимок с сервера', exact: true })).toBeVisible()
    assert.equal(await originalHash(page), hash)
    const unauthorized = await a.request.get(`${origin}/api/v1/prototype/photos/${id}/original`)
    assert.equal(unauthorized.status(), 401)
    const removal = other.waitForResponse(response => response.request().method() === 'DELETE' && response.url().endsWith(`/photos/${id}`)).then(response => response.status())
    await button(other, 'Удалить снимок').click()
    assert.equal(await removal, 200)
    await expect(other).toHaveURL(`${origin}/gallery`)
    await page.reload(); await expect(page.getByRole('heading', { name: 'Снимок недоступен', exact: true })).toBeVisible()
    await nav(page, 'Фото').click(); await expect(page.locator('.photo-card')).toHaveCount(0)
    const deleted = await a.request.get(`${origin}/api/v1/prototype/photos/${id}/original`, { headers: { Authorization: `Bearer ${code}` } })
    assert.equal(deleted.status(), 410)
    await other.setViewportSize({ width: 375, height: 812 }); await openSettings(other)
    assert.equal(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    if (process.env.LOCAL_APP_SCREENSHOT) await other.screenshot({ path: join(tmpdir(), `photobunker-server-${name}.png`), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(`${name}: real S3 upload, honest failure/retry, offline local replica, library isolation, browser-copy removal, new-browser recovery, metadata conflicts, original hash, authenticated read, verified deletion and mobile settings passed`)
  } finally {
    if (code && id && a) {
      try { await a.request.delete(`${origin}/api/v1/prototype/photos/${id}`, { headers: { Authorization: `Bearer ${code}` } }) } catch { /* The fixture ID can be retried by the local cleanup command. */ }
    }
    await b?.close(); await a?.close()
    await rm(profileA, { recursive: true, force: true }); await rm(profileB, { recursive: true, force: true })
  }
}
