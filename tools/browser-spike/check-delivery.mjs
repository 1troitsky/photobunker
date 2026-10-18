// Synthetic captures, isolated browser profiles, and loopback API only.
import { chromium, webkit, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback app URL')
const button = (page, name) => page.getByRole('button', { name, exact: true })
const rows = page => page.evaluate(async () => (await import('/src/local/photos.ts')).listPhotos())
const remote = page => page.evaluate(async () => (await import('/src/server/api.ts')).listServerPhotos())
const flush = page => page.evaluate(async () => (await import('/src/delivery/queue.ts')).retryDelivery())
async function connection(page, online) {
  await page.evaluate(value => { sessionStorage.setItem('qa-online', String(value)); globalThis.qaOnline = value; window.dispatchEvent(new Event(value ? 'online' : 'offline')) }, online)
}
for (const name of (process.env.DELIVERY_BROWSERS ?? 'chromium,webkit').split(',')) {
  const engine = { chromium, webkit }[name]
  if (!engine) throw new Error('Unknown QA browser')
  const directory = await mkdtemp(join(tmpdir(), `photobunker-delivery-${name}-`))
  let context, page
  const errors = []
  async function launch(online) {
    context = await engine.launchPersistentContext(directory, { headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 1000 } })
    await context.addInitScript(online => {
      globalThis.qaOnline = sessionStorage.getItem('qa-online') === null ? online : sessionStorage.getItem('qa-online') === 'true'
      Object.defineProperty(navigator, 'onLine', { get: () => globalThis.qaOnline })
      const fetch = window.fetch.bind(window)
      window.fetch = async (...args) => {
        const [url, options] = args
        if (String(url).includes('/api/') && !globalThis.qaOnline) throw new TypeError('Synthetic offline')
        const upload = String(url).endsWith('/prototype/photos') && options?.method === 'POST'
        if (upload && globalThis.qaRejectUpload) return new Response('{}', { status: 503 })
        const response = await fetch(...args)
        if (upload && response.ok && globalThis.qaLoseAck) { globalThis.qaLoseAck = false; throw new TypeError('Synthetic lost acknowledgement') }
        return response
      }
    }, online)
    page = context.pages()[0]
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
  }
  try {
    await launch(true)
    await page.goto(`${origin}/profiles/new`)
    await page.getByLabel('Название пресета', { exact: true }).fill('Очередь и сроки')
    await page.getByLabel('Удалять после съёмки через', { exact: true }).selectOption('3600')
    await page.getByLabel('Категории — по одной на строке', { exact: true }).fill('Фасад\nВход')
    await page.getByLabel('Описание обязательно', { exact: true }).check()
    await button(page, 'Сохранить пресет').click()
    await page.locator('.profile-card').getByRole('button', { name: 'Снимать по пресету', exact: true }).click()
    await expect.poll(() => page.evaluate(async () => {
      const { accessLibraryId } = await import('/src/server/api.ts'); const { clockTime } = await import('/src/delivery/clock.ts')
      return clockTime(accessLibraryId.value).certain
    })).toBe(true)
    await connection(page, false)
    await button(page, 'Попробовать без камеры').click()
    await page.getByLabel('Категория', { exact: true }).selectOption('Фасад')
    for (let count = 1; count <= 3; count++) {
      await button(page, 'Снять фото').click()
      await expect.poll(async () => (await rows(page)).length).toBe(count)
    }
    const captures = await rows(page)
    assert.ok(captures.every(photo => photo.uploadRequested && photo.retentionAnchor && photo.expiresAt))
    const ids = captures.map(photo => photo.id).sort()
    await context.close(); await launch(false)
    await page.goto(`${origin}/gallery`)
    await expect(page.locator('.photo-card')).toHaveCount(3)
    assert.deepEqual((await rows(page)).map(photo => photo.id).sort(), ids)
    await page.evaluate(() => { globalThis.qaRejectUpload = true })
    await connection(page, true); await flush(page)
    await expect.poll(async () => (await rows(page)).filter(photo => photo.uploadError === 'network').length).toBe(3)
    await expect.poll(async () => { await flush(page); return (await remote(page)).photos.length }).toBe(0)
    await page.evaluate(() => { globalThis.qaRejectUpload = false; globalThis.qaLoseAck = true })
    await flush(page)
    // One server commit succeeded but its browser acknowledgement was lost.
    await expect.poll(async () => (await remote(page)).photos.length).toBe(3)
    const unacknowledged = (await rows(page)).find(photo => photo.uploadRequested)
    assert.ok(unacknowledged)
    await connection(page, false)
    await page.goto(`${origin}/gallery/${unacknowledged.id}`)
    await page.getByLabel('Заметка', { exact: true }).fill('Описание после потери ответа')
    await page.getByLabel('Метки', { exact: true }).fill('проверка, осмотр')
    await button(page, 'Сохранить изменения').click()
    await connection(page, true); await flush(page)
    await expect.poll(async () => (await rows(page)).filter(photo => photo.uploadRequested || photo.metadataDirty).length).toBe(0)
    const saved = (await remote(page)).photos
    assert.deepEqual(saved.map(photo => photo.id).sort(), ids)
    assert.equal(saved.find(photo => photo.id === unacknowledged.id).note, 'Описание после потери ответа')
    assert.deepEqual(saved.find(photo => photo.id === unacknowledged.id).tags, ['проверка', 'осмотр'])
    for (const captured of captures) assert.ok(saved.find(photo => photo.id === captured.id).expiresAt <= captured.expiresAt)
    assert.equal(await page.evaluate(async id => {
      const { readPhoto } = await import('/src/local/photos.ts'); const { serverContent } = await import('/src/server/api.ts')
      const { photo, blob } = await readPhoto(id); const cloud = await serverContent(id, 'original', photo.mime, photo.bytes)
      const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',')
      return await hash(blob) === await hash(cloud)
    }, unacknowledged.id), true)
    console.log(`${name}: offline capture, browser restart, server outage, lost acknowledgement, metadata reconciliation and no duplicate uploads passed`)

    await page.evaluate(async id => {
      const api = await import('/src/server/api.ts'); const current = await api.serverPhoto(id)
      await api.updateServerPhoto(current, { title: current.title, note: 'Правка другого браузера', favorite: current.favorite })
      globalThis.qaOnline = false; sessionStorage.setItem('qa-online', 'false')
      const { updatePhoto } = await import('/src/server/photos.ts')
      await updatePhoto(id, { title: current.title, note: 'Местная правка', favorite: current.favorite })
    }, unacknowledged.id)
    await connection(page, true); await flush(page)
    await expect.poll(async () => (await rows(page)).find(photo => photo.id === unacknowledged.id)?.uploadError).toBe('conflict')
    await page.goto(`${origin}/gallery/${unacknowledged.id}`)
    await button(page, 'Открыть серверную версию').click()
    await expect(page.getByLabel('Заметка', { exact: true })).toHaveValue('Правка другого браузера')
    await expect.poll(async () => (await rows(page)).find(photo => photo.id === unacknowledged.id)?.metadataDirty).toBe(false)

    await page.goto(`${origin}/gallery`)
    await page.getByRole('searchbox').fill('осмотр'); await expect(page.locator('.photo-card')).toHaveCount(1)
    await page.getByRole('searchbox').fill(unacknowledged.shortId); await expect(page.locator('.photo-card')).toHaveCount(1)
    await page.getByRole('searchbox').fill('')
    await page.getByLabel('Выполнение требований', { exact: true }).selectOption('complete'); await expect(page.locator('.photo-card')).toHaveCount(1)
    await page.getByLabel('Выполнение требований', { exact: true }).selectOption('incomplete'); await expect(page.locator('.photo-card')).toHaveCount(2)
    await page.getByLabel('Выполнение требований', { exact: true }).selectOption('')
    await page.getByLabel('Категория', { exact: true }).selectOption('Фасад'); await expect(page.locator('.photo-card')).toHaveCount(3)
    await page.getByLabel('Снято с', { exact: true }).fill('2099-01-01'); await expect(page.locator('.photo-card')).toHaveCount(0)
    await page.getByLabel('Снято с', { exact: true }).fill('')
    await button(page, 'Выбрать фотографии').click(); await button(page, 'Выбрать найденные').click()
    await page.setViewportSize({ width: 375, height: 812 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.setViewportSize({ width: 1280, height: 1000 })
    await button(page, 'В избранное').click()
    await expect.poll(async () => { await flush(page); return (await remote(page)).photos.every(photo => photo.favorite) }).toBe(true)

    // Short server TTL without waiting an hour; use the supported shorter deadline API.
    const expiring = captures.find(photo => photo.id !== unacknowledged.id)
    await page.goto(`${origin}/gallery/${expiring.id}`)
    await expect(page.locator('.original-preview img')).toBeVisible()
    await page.evaluate(async id => {
      const api = await import('/src/server/api.ts'); const photo = await api.serverPhoto(id)
      await api.updateServerPhoto(photo, { title: photo.title, note: photo.note, favorite: photo.favorite, expiresAt: Date.now() + 3000 })
      await (await import('/src/local/library.ts')).refreshLibrary()
    }, expiring.id)
    await expect(page.getByRole('heading', { name: 'Снимок недоступен', exact: true })).toBeVisible({ timeout: 10_000 })
    await expect.poll(async () => page.evaluate(async id => (await import('/src/local/photos.ts')).readMetadata(id), expiring.id)).toBeUndefined()
    assert.equal(await page.evaluate(async id => {
      const { DATABASE } = await import('/src/local/photos.ts')
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result; const tx = db.transaction(['originals', 'thumbnails'], 'readonly')
          const original = tx.objectStore('originals').get(id); const thumbnail = tx.objectStore('thumbnails').get(id)
          tx.oncomplete = () => { db.close(); resolve(original.result === undefined && thumbnail.result === undefined) }
        }
      })
    }, expiring.id), true)
    const code = await page.evaluate(() => localStorage.getItem('photobunker-prototype-access'))
    for (const suffix of ['', '/original', '/thumbnail']) assert.equal((await context.request.get(`${origin}/api/v1/prototype/photos/${expiring.id}${suffix}`, { headers: { Authorization: `Bearer ${code}` } })).status(), 410)

    await page.goto(`${origin}/camera`); await connection(page, false)
    await button(page, 'Попробовать без камеры').click(); await button(page, 'Снять фото').click()
    await expect.poll(async () => (await rows(page)).length).toBe(3)
    const offline = (await rows(page)).find(photo => !ids.includes(photo.id))
    await page.evaluate(async id => {
      await (await import('/src/local/photos.ts')).patchPhoto(id, { expiresAt: Date.now() - 1 })
      await (await import('/src/delivery/queue.ts')).flushDelivery()
    }, offline.id)
    await expect.poll(async () => (await rows(page)).find(photo => photo.id === offline.id)?.deleteRequested).toBe(true)
    await connection(page, true); await flush(page)
    assert.ok(!(await remote(page)).photos.some(photo => photo.id === offline.id))
    await page.goto(`${origin}/gallery`)
    await expect(page.locator('.photo-card')).toHaveCount(2)
    await button(page, 'Выбрать фотографии').click(); await button(page, 'Выбрать найденные').click(); await button(page, 'Удалить выбранные').click()
    await flush(page); await expect(page.locator('.photo-card')).toHaveCount(0)
    await expect.poll(async () => { await flush(page); return (await remote(page)).photos.length }).toBe(0)
    await page.setViewportSize({ width: 375, height: 812 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    console.log(`${name}: tag/number search, requirement/category/date filters, bulk favourites/deletion, live expiry, local file cleanup and expired offline upload denial passed`)
  } catch (error) {
    if (page && !page.isClosed()) console.log(name, 'queue diagnostics', (await rows(page).catch(() => [])).map(({ id, uploadRequested, metadataDirty, uploadError, remoteRevision }) => ({ id, uploadRequested, metadataDirty, uploadError, remoteRevision })))
    throw error
  } finally {
    if (page && !page.isClosed()) await page.evaluate(async () => {
      globalThis.qaOnline = true; globalThis.qaRejectUpload = false; globalThis.qaLoseAck = false
      const api = await import('/src/server/api.ts'); const local = await import('/src/local/photos.ts')
      for (const photo of [...await local.listPhotos(), ...(await api.listServerPhotos()).photos]) await api.deleteServerPhoto(photo.id)
    }).catch(() => {})
    await context?.close(); await rm(directory, { recursive: true, force: true })
  }
}
