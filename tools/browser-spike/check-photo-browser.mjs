// Focused R1-12 acceptance: real encrypted photo index, current task ACL,
// offline list cache and collection revoke. Synthetic accounts are removed.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import {
  origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime,
} from './account-qa.mjs'
import { enrollPhotos, unlockPhotos, preparePhotos, jobs, received } from './photo-qa.mjs'

const browser = await chromium.launch({ headless: true })
const fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
const downloads = await mkdtemp(join(tmpdir(), 'photobunker-browser-'))
const execFile = promisify(execFileCallback)
let stage = 'accounts'

async function contact(one, two) {
  for (const [owner, person] of [[one, two], [two, one]]) {
    assert.equal((await owner.context.request.post(`${origin}/api/v1/identity/contacts`, {
      headers, data: { publicId: person.me.account.publicId },
    })).status(), 200)
  }
}
async function participant(page, person) {
  await button(page, 'Добавить участника').click()
  await label(page, 'ID участника').fill(person.me.account.publicId)
  await button(page, 'Готово').click()
}
async function accept(fixture, taskName) {
  await fixture.page.goto(`${origin}/assignments`)
  const invite = fixture.page.locator('.workspace-invitations .form-card').filter({ hasText: taskName })
  await invite.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(invite).toHaveCount(0)
}
function cleanJpeg(bytes, thumbnail = false) {
  assert.equal(bytes[0], 0xff)
  assert.equal(bytes[1], 0xd8)
  const text = bytes.toString('latin1')
  assert.ok(!text.includes('Exif\0\0'))
  assert.ok(!/GPSLatitude|GPSLongitude|PRIVATE NOTE/i.test(text))
  if (!thumbnail) return
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1]
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      assert.ok(Math.max(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 7)) <= 80)
      return
    }
    if (marker === 0xda || marker === 0xd9) break
    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  assert.fail('JPEG dimensions missing')
}

try {
  const owner = await accountFixture(browser, 'photo browser owner', fixtures)
  const viewer = await accountFixture(browser, 'photo browser viewer', fixtures)
  const stranger = await accountFixture(browser, 'photo browser stranger', fixtures)
  for (const fixture of fixtures) {
    await monitorRuntime(fixture.page, 'chromium', errors, diagnostics)
    await enrollPhotos(fixture)
  }
  await contact(owner, viewer)

  stage = 'assignment'
  await owner.page.goto(`${origin}/assignments/new`)
  await label(owner.page, 'Название').fill('QA protected browser')
  await owner.page.getByRole('tab', { name: 'Участники', exact: true }).click()
  await participant(owner.page, viewer)
  await owner.page.locator('.participant-main').filter({ hasText: viewer.me.account.publicId }).click()
  await label(owner.page, 'Роль').selectOption('viewer')
  await label(owner.page, 'Доступ к фотографиям').selectOption('thumbnails')
  await button(owner.page, 'Готово').click()
  await button(owner.page, 'Сохранить').click()
  await expect(owner.page).toHaveURL(/\/assignments\/[a-f0-9-]{36}$/)
  const assignment = new URL(owner.page.url()).pathname.split('/').at(-1)
  await accept(viewer, 'QA protected browser')

  stage = 'capture'
  await unlockPhotos(owner, assignment)
  await owner.page.goto(`${origin}/assignments/${assignment}`)
  await button(owner.page, 'Снимать').click()
  const review = owner.page.getByRole('dialog', { name: 'Участники общей съёмки', exact: true })
  await expect(review).toBeVisible()
  await button(owner.page, 'Подтвердить участников').click()
  await expect(review).toHaveCount(0)
  await unlockPhotos(viewer, assignment)
  await preparePhotos(viewer)
  await button(owner.page, 'Попробовать без камеры').click()
  await button(owner.page, 'Снять фото').click()
  await expect.poll(async () => (await jobs(owner)).length).toBe(1)
  await received(owner, 1)
  const photoId = (await jobs(owner))[0].id

  stage = 'saved-version'
  await owner.page.goto(`${origin}/gallery/${photoId}/edit`)
  await expect(owner.page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await owner.page.getByRole('tab', { name: 'Приватность', exact: true }).click()
  await label(owner.page, 'Водяной знак').fill('QA browser export')
  await label(owner.page, 'Водяной знак').blur()
  await button(owner.page, 'Сохранить версию').click()
  await expect(owner.page).toHaveURL(/\/gallery\/[^/]+\?version=/, { timeout: 30_000 })
  await expect.poll(() => owner.page.evaluate(async id => {
    const photos = await import('/src/server/photos.ts')
    const versions = await import('/src/studio/versions.ts')
    return (await versions.listPhotoVersions((await photos.readPhoto(id)).photo))[0]?.sync
  }, photoId), { timeout: 30_000 }).toBe('synced')

  stage = 'create-collection'
  await owner.page.goto(`${origin}/browser?assignment=${assignment}`)
  await expect(owner.page.getByText('QA protected browser', { exact: true })).toBeVisible()
  await expect(owner.page.locator('.browser-assignment-choice input')).toBeChecked()
  await button(owner.page, 'Открыть коллекцию').click()
  await expect(owner.page).toHaveURL(/\/browser\/[a-f0-9-]{36}$/)
  const collectionUrl = owner.page.url()
  await expect(owner.page.locator('.browser-photo')).toHaveCount(1, { timeout: 30_000 })

  stage = 'owner-zip'
  await button(owner.page, 'Выбрать').click()
  await owner.page.locator('.browser-check input').check()
  await label(owner.page, 'Поиск по разрешённым названиям').fill('__hidden__')
  await expect(owner.page.getByText('Выбрано фотографий: 1', { exact: false })).toBeVisible()
  await expect(button(owner.page, 'Скачать ZIP')).toBeEnabled()
  // Headless automation cannot operate Chromium's native file-system picker;
  // exercise the bounded browser-download fallback here.
  await owner.page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true, value: undefined,
  }))
  const zipEvent = owner.page.waitForEvent('download')
  await button(owner.page, 'Скачать ZIP').click()
  const zipDownload = await zipEvent
  const zipPath = join(downloads, 'photos.zip')
  await zipDownload.saveAs(zipPath)
  await execFile('/usr/bin/unzip', ['-t', zipPath])
  const archive = await readFile(zipPath)
  assert.ok(archive.includes(Buffer.from('QA protected browser')))
  assert.ok(!archive.toString('latin1').match(/Exif\0\0|GPSLatitude|GPSLongitude|PRIVATE NOTE/i))
  await expect(owner.page.getByText(/Файл передан браузеру|ZIP записан/)).toBeVisible()
  await label(owner.page, 'Поиск по разрешённым названиям').fill('')

  stage = 'owner-cancel'
  let releaseObject, reachedObject
  const objectReached = new Promise(resolve => { reachedObject = resolve })
  const objectHeld = new Promise(resolve => { releaseObject = resolve })
  let held = false
  await owner.page.route('**/api/v1/identity/secure/photos/**/objects/**', async route => {
    if (!held) {
      held = true
      reachedObject()
      await objectHeld
    }
    await route.continue().catch(() => {})
  })
  await button(owner.page, 'Скачать JPEG').click()
  await objectReached
  await button(owner.page, 'Отменить').click()
  releaseObject()
  await expect(owner.page.getByText('Экспорт отменён, файл не готов.', { exact: true })).toBeVisible()
  await owner.page.unroute('**/api/v1/identity/secure/photos/**/objects/**')

  stage = 'viewer'
  await viewer.page.goto(collectionUrl)
  await expect(viewer.page.locator('.browser-photo')).toHaveCount(1, { timeout: 30_000 })
  await button(viewer.page, 'Список').click()
  await expect(viewer.page.locator('.browser-list li')).toHaveCount(1)
  await button(viewer.page, 'Дерево').click()
  await expect(viewer.page.locator('.browser-tree details')).toHaveCount(1)
  await button(viewer.page, 'Выбрать').click()
  await viewer.page.locator('.browser-tree input[type=checkbox]').check()
  await expect(viewer.page.getByText('Выбрано фотографий: 1', { exact: false })).toBeVisible()

  stage = 'thumbnail-download'
  const jpegEvent = viewer.page.waitForEvent('download')
  await button(viewer.page, 'Скачать JPEG').click()
  const jpegDownload = await jpegEvent
  const jpegPath = join(downloads, 'thumbnail.jpg')
  await jpegDownload.saveAs(jpegPath)
  cleanJpeg(await readFile(jpegPath), true)
  await expect(viewer.page.getByText(/Файл передан браузеру/)).toBeVisible()
  await viewer.page.locator('.browser-tree a').click()
  await expect(viewer.page).toHaveURL(new RegExp(`/gallery/${photoId}/card$`))

  stage = 'stranger-denied'
  const collectionId = new URL(collectionUrl).pathname.split('/').at(-1)
  assert.equal((await stranger.context.request.get(
    `${origin}/api/v1/identity/workspace/browser/${collectionId}`, { headers },
  )).status(), 404)

  stage = 'offline-reload'
  await viewer.page.goto(collectionUrl)
  await expect(viewer.page.locator('.browser-photo')).toHaveCount(1, { timeout: 30_000 })
  // Persist a fresh authenticated server-time floor immediately before the
  // deliberate outage; offline E2EE must not trust an absent/stale clock.
  await viewer.page.evaluate(async () => { await (await import('/src/crypto/photos.ts')).index() })
  assert.equal(await viewer.page.evaluate(async owner =>
    !!(await (await import('/src/crypto/database.ts')).get(`clock:${owner}`))?.savedAt,
  viewer.me.account.id), true)
  await viewer.page.addInitScript(() => Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => sessionStorage.getItem('qa-photo-browser-offline') !== '1',
  }))
  await viewer.page.evaluate(() => sessionStorage.setItem('qa-photo-browser-offline', '1'))
  await viewer.page.route('**/api/**', route => route.abort('internetdisconnected'))
  await viewer.page.reload()
  await expect.poll(() => viewer.page.evaluate(async owner => {
    const identity = await import('/src/identity/store.ts')
    const clock = await (await import('/src/crypto/database.ts')).get(`clock:${owner}`)
    return identity.account.value?.id === owner && !!clock?.savedAt
  }, viewer.me.account.id), { timeout: 15_000 }).toBe(true)
  // A reload intentionally drops decrypted photo keys. Re-unlock locally;
  // the collection itself must then open without a network response.
  await viewer.page.evaluate(async kit => {
    const protection = await import('/src/crypto/store.ts')
    const trusted = await import('/src/crypto/trusted.ts')
    await new Promise(resolve => setTimeout(resolve, 1500))
    for (let attempt = 0; attempt < 3 && !protection.strongUnlocked.value; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 500))
      await protection.loadProtection()
      if (protection.strongUnlocked.value) break
      try { await protection.unlock(await trusted.rememberedKit() || kit) }
      catch (error) {
        if (!(error instanceof Error) || !['crypto.locked', 'crypto.failed'].includes(error.message) || attempt > 1) throw error
      }
    }
  }, viewer.photoKit)
  await expect(viewer.page.getByText(/^Офлайн:/)).toBeVisible()
  await expect(viewer.page.locator('.browser-photo')).toHaveCount(1)
  await expect(viewer.page.locator('.browser-photo img')).toHaveCount(0)

  stage = 'revoke-mid-export'
  await viewer.page.evaluate(() => sessionStorage.removeItem('qa-photo-browser-offline'))
  await viewer.page.unroute('**/api/**')
  await viewer.page.reload()
  await expect(viewer.page.locator('.browser-photo')).toHaveCount(1, { timeout: 30_000 })
  await button(viewer.page, 'Выбрать').click()
  await viewer.page.locator('.browser-check input').check()
  let releaseViewer, reachedViewer
  const viewerReached = new Promise(resolve => { reachedViewer = resolve })
  const viewerHeld = new Promise(resolve => { releaseViewer = resolve })
  let viewerObjectHeld = false
  await viewer.page.route('**/api/v1/identity/secure/photos/**/objects/**', async route => {
    if (!viewerObjectHeld) {
      viewerObjectHeld = true
      reachedViewer()
      await viewerHeld
    }
    await route.continue().catch(() => {})
  })
  await button(viewer.page, 'Скачать JPEG').click()
  await viewerReached
  owner.page.once('dialog', dialog => dialog.accept())
  await button(owner.page, 'Отозвать коллекцию').click()
  await expect(owner.page.getByText('Доступ отозван', { exact: true })).toBeVisible()
  releaseViewer()
  await expect(viewer.page.getByText('Доступ отозван, истёк или изменился. Экспорт остановлен.', { exact: true })).toBeVisible()
  await viewer.page.unroute('**/api/v1/identity/secure/photos/**/objects/**')
  await expect(viewer.page.getByText('Нет доступа к одному или нескольким заданиям.', { exact: true })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('chromium: R1-12/13 ACL, clean thumbnail JPEG, interoperable ZIP, stable filtered selection, cancel, offline list and revoke-mid-export passed')
} catch (error) {
  console.error(`chromium: photo browser failed at ${stage} (${error instanceof Error ? error.name : 'unknown'})`)
  console.error({ code: error instanceof Error ? error.message : 'failed', runtime: errors })
  for (const fixture of fixtures) {
    console.error(await fixture.page.evaluate(async owner => {
      const library = await import('/src/local/library.ts')
      const identity = await import('/src/identity/store.ts')
      const clock = await (await import('/src/crypto/database.ts')).get(`clock:${owner}`)
      return {
        path: location.pathname,
        browserStatus: document.querySelector('.protected-browser [role=status]')?.textContent?.trim(),
        exportStatus: document.querySelector('.browser-export-status')?.textContent?.trim(),
        photos: library.photos.value.length,
        libraryError: library.libraryError.value,
        serverError: library.serverError.value,
        session: identity.sessionState.value,
        accountRestored: identity.account.value?.id === owner,
        clockSaved: !!clock?.savedAt,
      }
    }, fixture.me.account.id).catch(() => ({ path: 'closed' })))
  }
  throw new Error('photo_browser_qa_failed')
} finally {
  await cleanupFixtures(fixtures)
  await browser.close()
  await rm(downloads, { recursive: true, force: true })
}
