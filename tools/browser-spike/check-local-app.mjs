// Local app QA with generated images and disposable persistent browser profiles.
import { chromium, firefox, webkit, expect } from '@playwright/test'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback app URL')
async function snapshot(page) {
  return page.evaluate(async () => {
    const rows = await new Promise((resolve, reject) => {
      const req = indexedDB.open('photobunker-local-prototype-v1', 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result, names = ['photos', 'originals', 'thumbnails'], tx = db.transaction(names)
        const requests = names.map(name => tx.objectStore(name).getAll())
        tx.oncomplete = () => { db.close(); resolve(requests.map(request => request.result)) }
        tx.onabort = () => { db.close(); reject(tx.error) }
      }
    })
    const hashes = await Promise.all(rows[1].map(async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, '0')).join('')))
    return { photos: rows[0], counts: rows.map(row => row.length), hashes }
  })
}
const button = (page, name) => page.getByRole('button', { name, exact: true })
const nav = (page, name) => page.getByRole('navigation').getByRole('link', { name, exact: true })
async function capture(page) { await button(page, 'Попробовать без камеры').click(); await button(page, 'Снять фото').click() }
const saved = page => expect(page.getByRole('status')).toHaveText('Кадр сохранён в этом браузере')
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const profile = await mkdtemp(join(tmpdir(), `photobunker-app-${name}-`))
  const options = { headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 900 }, ...(name === 'chromium' ? { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } : {}) }
  let context, errors = []
  try {
    context = await engine.launchPersistentContext(profile, options)
    let page = context.pages()[0]
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin)
    await expect(button(page, 'Включить камеру')).toBeVisible()
    assert.equal(await page.locator('video').evaluate(video => video.srcObject), null)
    await capture(page); await saved(page)
    const before = await snapshot(page), id = before.photos[0].id
    assert.deepEqual(before.counts, [1, 1, 1])
    await nav(page, 'Галерея').click(); await expect(page.locator('.photo-card')).toHaveCount(1)
    await expect.poll(() => page.locator('.photo-card img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
    await page.locator('.photo-card').click(); await expect(page.locator('.original-preview img')).toBeVisible()
    await page.getByLabel('Название', { exact: true }).fill('Первый кадр')
    await page.getByLabel('Заметка', { exact: true }).fill('Локальная заметка')
    await button(page, 'Сохранить изменения').click(); await expect(page.getByRole('status')).toHaveText('Изменения сохранены')
    await button(page, 'В избранное').click(); await expect(button(page, 'Убрать из избранного')).toHaveAttribute('aria-pressed', 'true')
    assert.deepEqual((await snapshot(page)).hashes, before.hashes)
    const downloaded = page.waitForEvent('download'); await button(page, 'Скачать оригинал').click()
    const download = await downloaded
    assert.equal(download.suggestedFilename(), `photobunker-${id}.jpg`)
    assert.equal(createHash('sha256').update(await readFile(await download.path())).digest('hex'), before.hashes[0])
    await page.getByRole('link', { name: 'В галерею', exact: true }).click()
    await button(page, 'Избранное').click(); await expect(page.locator('.photo-card')).toHaveCount(1)
    await page.getByRole('searchbox').fill('отсутствует'); await expect(page.locator('.photo-card')).toHaveCount(0)
    await page.getByRole('searchbox').fill('локальная заметка'); await expect(page.locator('.photo-card')).toHaveCount(1)
    await page.reload(); await expect(page.locator('.photo-card')).toHaveCount(1)
    await context.close(); context = await engine.launchPersistentContext(profile, options)
    page = context.pages()[0]; page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/gallery/${id}`)
    await expect(page.getByRole('heading', { name: 'Первый кадр', exact: true })).toBeVisible()
    await expect(page.getByLabel('Заметка', { exact: true })).toHaveValue('Локальная заметка')
    assert.deepEqual((await snapshot(page)).hashes, before.hashes)
    page.on('dialog', dialog => dialog.accept())
    await button(page, 'Удалить снимок').click(); await expect(page).toHaveURL(`${origin}/gallery`)
    assert.deepEqual((await snapshot(page)).counts, [0, 0, 0])
    await page.goto(origin)
    await page.evaluate(() => {
      const add = IDBObjectStore.prototype.add
      window.restoreLocalWrites = () => { IDBObjectStore.prototype.add = add }
      IDBObjectStore.prototype.add = function (...args) {
        if (this.transaction.db.name === 'photobunker-local-prototype-v1' && this.name === 'originals') throw new DOMException('Test quota denial', 'QuotaExceededError')
        return add.apply(this, args)
      }
    })
    await capture(page); await expect(page.getByRole('status')).toContainText('Он пока только в памяти')
    await expect(page.locator('.pending-capture img')).toBeVisible()
    assert.deepEqual((await snapshot(page)).counts, [0, 0, 0])
    await page.evaluate(() => window.restoreLocalWrites()); await button(page, 'Повторить').click(); await saved(page)
    assert.deepEqual((await snapshot(page)).counts, [1, 1, 1])
    await nav(page, 'Настройки').click(); await button(page, 'Удалить все снимки').click()
    await expect(page.getByRole('status')).toHaveText('Все локальные снимки удалены')
    assert.deepEqual((await snapshot(page)).counts, [0, 0, 0])
    await page.goto(`${origin}/gallery/${id}`); await expect(page.getByRole('heading', { name: 'Снимок недоступен', exact: true })).toBeVisible()
    if (name === 'chromium') {
      await page.goto(origin); await button(page, 'Включить камеру').click(); await expect(button(page, 'Снять фото')).toBeEnabled()
      await page.evaluate(() => { window.testCameraTrack = document.querySelector('video').srcObject.getVideoTracks()[0] })
      await button(page, 'Снять фото').click(); await saved(page); await nav(page, 'Галерея').click()
      assert.equal(await page.evaluate(() => window.testCameraTrack.readyState), 'ended')
    }
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto(origin)
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test permission denial', 'NotAllowedError') } })
    await button(page, 'Включить камеру').click(); await expect(page.getByRole('status')).toContainText('Доступ к камере запрещён')
    await button(page, 'Попробовать без камеры').click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    if (process.env.LOCAL_APP_SCREENSHOT) await page.screenshot({ path: join(tmpdir(), `photobunker-app-${name}.png`), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(`${name}: capture, reload, process restart, immutable original, notes/favorite/search/download, atomic rollback/retry/delete/clear, missing photo, permission denial and mobile layout passed`)
  } finally { await context?.close(); await rm(profile, { recursive: true, force: true }) }
}
