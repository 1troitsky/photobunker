// Focused R1-12 acceptance: real encrypted photo index, current task ACL,
// offline list cache and collection revoke. Synthetic accounts are removed.
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime,
} from './account-qa.mjs'
import { enrollPhotos, unlockPhotos, preparePhotos, jobs, received } from './photo-qa.mjs'

const browser = await chromium.launch({ headless: true })
const fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
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

  stage = 'create-collection'
  await owner.page.goto(`${origin}/browser?assignment=${assignment}`)
  await expect(owner.page.getByText('QA protected browser', { exact: true })).toBeVisible()
  await expect(owner.page.locator('.browser-assignment-choice input')).toBeChecked()
  await button(owner.page, 'Открыть коллекцию').click()
  await expect(owner.page).toHaveURL(/\/browser\/[a-f0-9-]{36}$/)
  const collectionUrl = owner.page.url()
  await expect(owner.page.locator('.browser-photo')).toHaveCount(1, { timeout: 30_000 })

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
  await viewer.page.addInitScript(() => Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => sessionStorage.getItem('qa-photo-browser-offline') !== '1',
  }))
  await viewer.page.evaluate(() => sessionStorage.setItem('qa-photo-browser-offline', '1'))
  await viewer.page.route('**/api/**', route => route.abort('internetdisconnected'))
  await viewer.page.reload()
  // A reload intentionally drops decrypted photo keys. Re-unlock locally;
  // the collection itself must then open without a network response.
  await viewer.page.evaluate(async kit => {
    const protection = await import('/src/crypto/store.ts')
    await new Promise(resolve => setTimeout(resolve, 1500))
    for (let attempt = 0; attempt < 3 && !protection.strongUnlocked.value; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 500))
      await protection.loadProtection()
      try { await protection.unlock(kit) }
      catch (error) {
        if (!(error instanceof Error) || !['crypto.locked', 'crypto.failed'].includes(error.message) || attempt > 1) throw error
      }
    }
  }, viewer.photoKit)
  await expect(viewer.page.getByText(/^Офлайн:/)).toBeVisible()
  await expect(viewer.page.locator('.browser-photo')).toHaveCount(1)
  await expect(viewer.page.locator('.browser-photo img')).toHaveCount(0)

  stage = 'revoke'
  owner.page.once('dialog', dialog => dialog.accept())
  await button(owner.page, 'Отозвать коллекцию').click()
  await expect(owner.page.getByText('Доступ отозван', { exact: true })).toBeVisible()
  await viewer.page.evaluate(() => sessionStorage.removeItem('qa-photo-browser-offline'))
  await viewer.page.unroute('**/api/**')
  await viewer.page.reload()
  await expect(viewer.page.getByText('Коллекция недоступна, доступ отозван или срок истёк.', { exact: true })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('chromium: R1-12 ACL, modes, Photo Card, encrypted offline list and revoke passed')
} catch (error) {
  console.error(`chromium: photo browser failed at ${stage} (${error instanceof Error ? error.name : 'unknown'})`)
  console.error({ code: error instanceof Error ? error.message : 'failed', runtime: errors })
  for (const fixture of fixtures) {
    console.error(await fixture.page.evaluate(async () => {
      const library = await import('/src/local/library.ts')
      return {
        path: location.pathname,
        browserStatus: document.querySelector('.protected-browser [role=status]')?.textContent?.trim(),
        photos: library.photos.value.length,
        libraryError: library.libraryError.value,
        serverError: library.serverError.value,
      }
    }).catch(() => ({ path: 'closed' })))
  }
  throw new Error('photo_browser_qa_failed')
} finally {
  await cleanupFixtures(fixtures)
  await browser.close()
}
