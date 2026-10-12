// Synthetic photos and isolated accounts only. Never print access credentials.
import { chromium, webkit, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback app URL')
const button = (page, name) => page.getByRole('button', { name, exact: true })
async function newProfile(page, name, { square = false, location = false } = {}) {
  await page.goto(`${origin}/profiles/new`)
  await page.getByLabel('Название профиля', { exact: true }).fill(name)
  if (square) {
    await page.getByLabel('Разрешение', { exact: true }).selectOption('fixed')
    await page.getByLabel('Пропорции', { exact: true }).selectOption('1:1')
    await page.getByLabel('Ширина, пиксели', { exact: true }).fill('800')
    await page.getByLabel('Ширина, пиксели', { exact: true }).dispatchEvent('change')
    await page.getByLabel('Данные внутри файла', { exact: true }).selectOption('none')
    await page.getByLabel('Категории — по одной на строке', { exact: true }).fill('Фасад\nВход')
    await page.getByLabel('Необходимые кадры — по одному на строке', { exact: true }).fill('Главный вход')
    await page.getByLabel('Категория обязательна', { exact: true }).check()
    await page.getByLabel('Описание обязательно', { exact: true }).check()
    await page.getByLabel('Разрешать менять заполненные название, описание и категорию', { exact: true }).uncheck()
    await page.getByLabel('Префикс номера', { exact: true }).fill('SQ')
  } else {
    await page.getByLabel('Пропорции', { exact: true }).selectOption('16:9')
    if (location) await page.getByLabel('Геолокация', { exact: true }).selectOption('required')
  }
  await button(page, 'Сохранить профиль').click()
  await expect(page).toHaveURL(`${origin}/profiles`)
  return page.locator('.profile-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
}
async function capture(page, card, category = false) {
  await card.getByRole('button', { name: 'Снимать по профилю', exact: true }).click()
  await button(page, 'Попробовать без камеры').click()
  if (category) {
    await page.getByLabel('Категория', { exact: true }).selectOption('Фасад')
    await page.getByLabel('Кадр по списку', { exact: true }).selectOption('Главный вход')
  }
  await button(page, 'Снять фото').click()
  await expect(page.getByRole('status')).toContainText('Кадр сохранён в этом браузере')
  return page.evaluate(async () => (await (await import('/src/local/photos.ts')).listPhotos())[0])
}
for (const name of (process.env.PROFILE_BROWSERS ?? 'chromium,webkit').split(',')) {
  const engine = { chromium, webkit }[name]
  if (!engine) throw new Error('Unknown profile QA browser')
  const directoryA = await mkdtemp(join(tmpdir(), `photobunker-profiles-${name}-a-`))
  const directoryB = await mkdtemp(join(tmpdir(), `photobunker-profiles-${name}-b-`))
  let a, b, page
  const errors = []
  try {
    const options = { headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 1000 }, permissions: ['geolocation'], geolocation: { latitude: 41.7, longitude: 44.8, accuracy: 70 } }
    a = await engine.launchPersistentContext(directoryA, options)
    if (name === 'webkit') {
      // This installed Playwright WebKit build emits its emulated timestamp in
      // microseconds. Adapt only that synthetic provider, preserving sample age.
      // Production code continues to require the standard epoch milliseconds.
      await a.addInitScript(() => {
        const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation)
        navigator.geolocation.watchPosition = (success, failure, settings) => watch(position => {
          const timestamp = position.timestamp > Date.now() * 100 && Math.abs(position.timestamp / 1000 - Date.now()) < 60_000 ? Math.round(position.timestamp / 1000) : position.timestamp
          success({ coords: position.coords, timestamp, toJSON: () => ({ coords: position.coords.toJSON(), timestamp }) })
        }, failure, settings)
      })
    }
    page = a.pages()[0]; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    await page.goto(origin)
    await expect(page.getByRole('heading', { name: 'Профили', exact: true })).toBeVisible()
    const squareCard = await newProfile(page, 'Квадрат без данных', { square: true })
    const square = await capture(page, squareCard, true)
    assert.equal(square.width, 800); assert.equal(square.height, 800); assert.match(square.shortId, /^SQ-/)
    assert.equal(square.profile.version, 1); assert.equal(square.metadata.capturedAt, undefined)
    const exif = await page.evaluate(async id => {
      const { readPhoto } = await import('/src/local/photos.ts'); const { jpegMetadata } = await import('/src/profiles/image.ts')
      return jpegMetadata(new Uint8Array(await (await readPhoto(id)).blob.arrayBuffer())).exif
    }, square.id)
    assert.equal(exif, undefined)
    console.log(`${name}: square capture and EXIF removal passed`)
    await page.goto(`${origin}/gallery/${square.id}`)
    await expect(page.locator('.requirements-status')).toContainText('описание')
    await page.getByLabel('Заметка', { exact: true }).fill('Первое описание')
    await button(page, 'Сохранить изменения').click()
    await expect(page.getByLabel('Заметка', { exact: true })).toBeDisabled()
    await expect(page.locator('.requirements-status')).toHaveText('Требования выполнены')
    await button(page, 'Сохранить на сервере').click()
    await expect(page.getByRole('status')).toHaveText('На локальном сервере')
    const wideCard = await newProfile(page, 'Широкий с датой')
    const wide = await capture(page, wideCard)
    assert.equal(wide.width, 1600); assert.equal(wide.height, 900); assert.ok(wide.metadata.capturedAt)
    const hasDate = await page.evaluate(async id => {
      const { readPhoto } = await import('/src/local/photos.ts'); const { jpegMetadata } = await import('/src/profiles/image.ts')
      const { blob, photo } = await readPhoto(id)
      return jpegMetadata(new Uint8Array(await blob.arrayBuffer())).exif.includes(`${new Date(photo.metadata.capturedAt).getFullYear()}:`)
    }, wide.id)
    assert.equal(hasDate, true)
    console.log(`${name}: widescreen capture and date preservation passed`)
    await page.goto(`${origin}/gallery/${wide.id}`); await button(page, 'Сохранить на сервере').click(); await expect(page.getByRole('status')).toHaveText('На локальном сервере')
    // Editing profile rules leaves already captured photos attached to version 1.
    await page.goto(`${origin}/profiles/${square.profile.id}`)
    await page.getByLabel('Название профиля', { exact: true }).fill('Квадрат — новые правила')
    await button(page, 'Сохранить профиль').click(); await expect(page).toHaveURL(`${origin}/profiles`)
    await page.goto(`${origin}/gallery/${square.id}`)
    await expect(page.locator('.photo-profile-info')).toContainText('Квадрат без данных')
    await expect(page.locator('.photo-profile-info')).toContainText('Версия 1')
    const geoCard = await newProfile(page, 'Координаты после кадра', { location: true })
    const geoPhoto = await capture(page, geoCard)
    await a.setGeolocation({ latitude: 41.70001, longitude: 44.80001, accuracy: 5 })
    await expect.poll(() => page.evaluate(async id => (await (await import('/src/local/photos.ts')).readPhoto(id)).photo.metadata.location?.accuracy, geoPhoto.id)).toBe(5)
    // Another browser restores profiles and server-only photos using this test account.
    const code = await page.evaluate(() => localStorage.getItem('photobunker-prototype-access'))
    b = await engine.launchPersistentContext(directoryB, options)
    const other = b.pages()[0]; other.on('pageerror', error => errors.push(error.message))
    await other.goto(`${origin}/settings`); await other.locator('#restore-code').fill(code); await button(other, 'Открыть библиотеку').click()
    await expect(other.getByRole('status').filter({ hasText: 'Серверная библиотека подключена' })).toBeVisible()
    await other.goto(`${origin}/profiles`); await expect(other.locator('.profile-card')).toHaveCount(3)
    await other.goto(`${origin}/gallery/${square.id}`); await expect(other.locator('.original-preview img')).toBeVisible(); await expect(other.getByLabel('Заметка', { exact: true })).toHaveValue('Первое описание')
    await page.goto(`${origin}/profiles`)
    await expect(page.locator('.profile-card')).toHaveCount(3)
    await page.getByRole('heading', { name: 'Профили', exact: true }).click()
    await page.screenshot({ path: join(tmpdir(), `photobunker-profiles-${name}-desktop.png`), fullPage: true })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${origin}/profiles/${square.profile.id}`)
    await expect(page.getByLabel('Название профиля', { exact: true })).toHaveValue('Квадрат — новые правила')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: join(tmpdir(), `photobunker-profiles-${name}-mobile.png`), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(`${name}: profile creation, geometry, embedded metadata, restrictions, version history, delayed GPS, second browser and mobile layout passed`)
  } finally {
    if (page) await page.evaluate(async () => { const { listPhotos } = await import('/src/local/photos.ts'); const { deletePhoto } = await import('/src/server/photos.ts'); for (const photo of await listPhotos()) await deletePhoto(photo.id) }).catch(() => {})
    await a?.close(); await b?.close()
    await rm(directoryA, { recursive: true, force: true }); await rm(directoryB, { recursive: true, force: true })
  }
}
