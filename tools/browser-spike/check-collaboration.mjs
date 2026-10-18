// Synthetic media and disposable local accounts only. Never print invite/access codes.
import { chromium, webkit, expect } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)) throw new Error('Use a loopback app URL')
const button = (page, name) => page.getByRole('button', { name, exact: true })
const nav = (page, name) => page.getByRole('navigation').getByRole('link', { name, exact: true })
async function openPresets(page) { await nav(page, 'Камера').click(); await page.getByRole('link', { name: 'Пресеты камеры', exact: true }).click() }
const localRows = page => page.evaluate(async () => (await import('/src/local/photos.ts')).listPhotos())
const submissions = page => page.evaluate(async () => (await import('/src/collaboration/api.ts')).assignmentDetails(location.pathname.split('/').at(-1)))
async function online(page, value) { await page.evaluate(value => { globalThis.qaOffline = !value; window.dispatchEvent(new Event(value ? 'online' : 'offline')) }, value) }
async function capture(page, shot = 'Фасад') {
  await button(page, 'Попробовать без камеры').click()
  if (await page.getByLabel('Кадр по списку', { exact: true }).count()) await page.getByLabel('Кадр по списку', { exact: true }).selectOption(shot)
  const count = (await localRows(page)).length
  await button(page, 'Снять фото').click()
  await expect.poll(async () => (await localRows(page)).length).toBe(count + 1)
  return (await localRows(page))[0]
}
for (const name of (process.env.TEAM_BROWSERS ?? 'chromium,webkit').split(',')) {
  const engine = { chromium, webkit }[name]
  if (!engine) throw new Error('Unknown team QA browser')
  const directory = await mkdtemp(join(tmpdir(), `photobunker-team-${name}-`))
  let a, b, v, owner, member, viewer, ownerCode
  const errors = []
  async function context(suffix) {
    const ctx = await engine.launchPersistentContext(join(directory, suffix), { headless: true, locale: 'ru-RU', viewport: { width: 1280, height: 1000 } })
    await ctx.addInitScript(() => {
      globalThis.qaOffline = false
      Object.defineProperty(navigator, 'onLine', { get: () => !globalThis.qaOffline })
      const fetch = window.fetch.bind(window)
      window.fetch = (...args) => globalThis.qaOffline && String(args[0]).includes('/api/') ? Promise.reject(new TypeError('Synthetic offline')) : fetch(...args)
    })
    const page = ctx.pages()[0]; page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    return [ctx, page]
  }
  async function newInvite(role) {
    await owner.getByLabel('Роль', { exact: true }).selectOption(role)
    const previous = await owner.locator('.invitation-code textarea').count() ? await owner.locator('.invitation-code textarea').inputValue() : ''
    await button(owner, 'Создать приглашение').click()
    await expect(owner.locator('.invitation-code textarea')).not.toHaveValue(previous)
    return owner.locator('.invitation-code textarea').inputValue()
  }
  async function joinPage(page, code, nickname) {
    await page.goto(`${origin}/join`)
    await page.getByLabel('Код приглашения', { exact: true }).fill(code)
    await page.getByLabel('Ваше имя для участников', { exact: true }).fill(nickname)
    await button(page, 'Принять приглашение').click()
    await expect(page).toHaveURL(`${origin}/assignments`)
  }
  try {
    [a, owner] = await context('owner'); [b, member] = await context('member')
    await owner.goto(`${origin}/profiles/new`)
    await owner.getByLabel('Название пресета', { exact: true }).fill('Совместный осмотр')
    await owner.getByLabel('Описание обязательно', { exact: true }).check()
    await owner.getByLabel('Удалять после съёмки через', { exact: true }).selectOption('3600')
    await button(owner, 'Сохранить пресет').click(); await expect(owner).toHaveURL(`${origin}/camera/presets`)
    await button(owner, 'Снимать по пресету').click()
    const personal = await capture(owner)
    await expect.poll(async () => (await localRows(owner)).find(row => row.id === personal.id)?.uploadRequested).toBe(false)
    await openPresets(owner); await owner.getByRole('link', { name: 'Совместная работа', exact: true }).click()
    await button(owner, 'Включить совместную работу').click(); await expect(owner.locator('.team-role')).toContainText('Владелец')
    const profileId = (await owner.evaluate(async () => (await import('/src/profiles/store.ts')).profiles.value))[0].id
    ownerCode = await owner.evaluate(() => localStorage.getItem('photobunker-prototype-access'))
    const inviteCode = await newInvite('contributor')
    await joinPage(member, inviteCode, 'Исполнитель А')
    const memberCode = await member.evaluate(() => localStorage.getItem('photobunker-prototype-access'))
    assert.notEqual(memberCode, ownerCode)
    await button(owner, 'Обновить').click()
    await expect(owner.locator('.member-row').filter({ hasText: 'Исполнитель А' })).toBeVisible()
    await owner.getByLabel('Название задания', { exact: true }).fill('Осмотр входа')
    await owner.getByLabel('Инструкции', { exact: true }).fill('Снять фасад и вход. Не включать людей в кадр.')
    await owner.getByRole('group', { name: 'Исполнители задания', exact: true }).getByLabel('Исполнитель А', { exact: true }).check()
    await owner.getByLabel('Нужные кадры — по одному на строке', { exact: true }).fill('Фасад\nВход')
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0,16)
    await owner.getByLabel('Срок выполнения', { exact: true }).fill(tomorrow)
    await button(owner, 'Создать задание').click(); await expect(owner).toHaveURL(/\/assignments\/[a-f0-9-]+$/)
    const taskId = new URL(owner.url()).pathname.split('/').at(-1)
    await member.locator('.page-heading').getByRole('button', { name: 'Обновить', exact: true }).click()
    await member.getByRole('link', { name: 'Осмотр входа', exact: true }).click()
    await expect(member.locator('.task-instructions')).toContainText('Снять фасад')
    await button(member, 'Снимать по заданию').click()
    await expect.poll(() => member.evaluate(async () => { const { accessLibraryId } = await import('/src/server/api.ts'); return (await import('/src/delivery/clock.ts')).clockTime(accessLibraryId.value).certain })).toBe(true)
    await online(member, false)
    const first = await capture(member)
    assert.equal(first.assignmentId, taskId); assert.equal(first.uploadOnly, true)
    await expect(member.locator('.archive-button img')).toHaveCount(0)
    await nav(member, 'Фото').click(); await expect(member.locator('.photo-card')).toHaveCount(0)
    await member.goto(`${origin}/gallery/${first.id}`)
    await expect(member.getByRole('heading', { name: 'Снимок недоступен', exact: true })).toBeVisible()
    await online(member, true)
    await expect.poll(async () => (await localRows(member)).find(row => row.id === first.id)?.deliveryOnly, { timeout: 15_000 }).toBe(true)
    assert.equal(await member.evaluate(async id => {
      const { DATABASE } = await import('/src/local/photos.ts')
      return new Promise((resolve, reject) => { const open = indexedDB.open(DATABASE); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const tx = db.transaction(['originals','thumbnails']); const original = tx.objectStore('originals').get(id); const thumbnail = tx.objectStore('thumbnails').get(id); tx.oncomplete = () => { db.close(); resolve(original.result === undefined && thumbnail.result === undefined) } } })
    }, first.id), true)
    for (const suffix of ['', '/original', '/thumbnail']) assert.equal((await b.request.get(`${origin}/api/v1/prototype/photos/${first.id}${suffix}`, { headers: { Authorization: `Bearer ${memberCode}` } })).status(), 403)
    assert.equal((await b.request.get(`${origin}/api/v1/prototype/photos/${personal.id}/original`, { headers: { Authorization: `Bearer ${memberCode}` } })).status(), 404)
    await expect(owner.locator(`.submission-card[data-photo-id="${first.id}"]`)).toBeVisible({ timeout: 15_000 })
    const firstCard = owner.locator(`.submission-card[data-photo-id="${first.id}"]`)
    await firstCard.getByLabel('Решение', { exact: true }).selectOption('correction')
    await firstCard.getByLabel('Замечание', { exact: true }).fill('Добавьте описание входа')
    await firstCard.getByRole('button', { name: 'Сохранить решение', exact: true }).click()
    await expect(firstCard.locator('.review-state')).toHaveAttribute('data-state', 'correction')
    await member.goto(`${origin}/assignments/${taskId}`)
    const memberFirst = member.locator(`.submission-card[data-photo-id="${first.id}"]`)
    await expect(memberFirst.locator('.review-comment')).toContainText('Добавьте описание входа')
    await memberFirst.getByLabel('Ответ куратору', { exact: true }).fill('Данные дополнены')
    await memberFirst.getByLabel('Дополнить описание фотографии', { exact: true }).check()
    await memberFirst.locator('textarea[aria-label="Дополнить описание фотографии"]').fill('Вход с северной стороны')
    await memberFirst.getByRole('button', { name: 'Отправить ответ', exact: true }).click()
    await expect(memberFirst.locator('.review-state')).toHaveAttribute('data-state', 'pending')
    await owner.goto(`${origin}/gallery/${first.id}`)
    await expect(owner.getByLabel('Заметка', { exact: true })).toHaveValue('Вход с северной стороны')
    const originalHash = await owner.evaluate(async id => { const api = await import('/src/server/photos.ts'); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await api.readPhoto(id)).blob.arrayBuffer()))).join(',') }, first.id)
    await owner.getByLabel('Решение', { exact: true }).selectOption('reshoot')
    await owner.getByLabel('Замечание', { exact: true }).fill('Снимите ближе к входу')
    await button(owner, 'Сохранить решение').click()
    await expect(memberFirst.locator('.review-state')).toHaveAttribute('data-state', 'reshoot', { timeout: 15_000 })
    await memberFirst.getByRole('button', { name: 'Переснять этот кадр', exact: true }).click()
    await expect(member.getByLabel('Кадр по списку', { exact: true })).toHaveValue('Фасад')
    const replacement = await capture(member)
    assert.equal(replacement.replacesId, first.id)
    await expect.poll(async () => (await localRows(member)).find(row => row.id === replacement.id)?.deliveryOnly, { timeout: 15_000 }).toBe(true)
    await owner.goto(`${origin}/assignments/${taskId}`)
    const nextCard = owner.locator(`.submission-card[data-photo-id="${replacement.id}"]`)
    await expect(nextCard).toBeVisible()
    await nextCard.getByRole('button', { name: 'Сохранить решение', exact: true }).click()
    await expect(nextCard.locator('.review-state')).toHaveAttribute('data-state', 'accepted')
    assert.equal(await owner.evaluate(async id => { const api = await import('/src/server/photos.ts'); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await api.readPhoto(id)).blob.arrayBuffer()))).join(',') }, first.id), originalHash)
    await owner.goto(`${origin}/profiles/${profileId}/team`)
    const person = owner.locator('.member-row').filter({ hasText: 'Исполнитель А' })
    await person.getByLabel('Исполнитель видит свои отправленные фотографии', { exact: true }).check()
    await person.getByRole('button', { name: 'Сохранить права', exact: true }).click()
    await nav(member, 'Фото').click(); await expect(member.locator('.photo-card')).toHaveCount(2)
    await member.locator(`.photo-card[href="/gallery/${first.id}"]`).click(); await expect(member.locator('.original-preview img')).toBeVisible()
    await person.getByLabel('Исполнитель видит свои отправленные фотографии', { exact: true }).uncheck()
    await person.getByRole('button', { name: 'Сохранить права', exact: true }).click()
    await expect(member.getByRole('heading', { name: 'Снимок недоступен', exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(member.locator('.original-preview img')).toHaveCount(0)
    console.log(`${name}: separate identities, private history, assignment capture, offline upload-only queue, confirmed local file removal, correction, reshoot, immutable original and gallery permission changes passed`)

    const viewerInvite = await newInvite('viewer'); [v, viewer] = await context('viewer')
    await joinPage(viewer, viewerInvite, 'Наблюдатель')
    await openPresets(viewer); await expect(button(viewer, 'Снимать по пресету')).toHaveCount(0)
    await viewer.goto(`${origin}/gallery/${replacement.id}`)
    await expect(viewer.locator('.original-preview img')).toBeVisible()
    await expect(viewer.getByLabel('Заметка', { exact: true })).toBeDisabled()
    await expect(button(viewer, 'В избранное')).toBeDisabled()
    await expect(button(viewer, 'Удалить снимок')).toHaveCount(0)
    await expect(viewer.locator('.review-panel')).toHaveCount(0)
    await member.goto(`${origin}/assignments/${taskId}`); await button(member, 'Снимать по заданию').click(); await online(member, false)
    const revokedCapture = await capture(member, 'Вход')
    await person.getByRole('button', { name: 'Отозвать', exact: true }).click()
    await expect(person).toContainText('Отозвано')
    await online(member, true)
    await expect.poll(async () => (await localRows(member)).find(row => row.id === revokedCapture.id)?.uploadError, { timeout: 15_000 }).toBe('permission')
    await member.goto(`${origin}/assignments`)
    await expect(member.locator('.assignment-card')).toHaveCount(0)
    assert.equal((await b.request.get(`${origin}/api/v1/prototype/photos/${first.id}/original`, { headers: { Authorization: `Bearer ${memberCode}` } })).status(), 404)
    assert.equal((await a.request.get(`${origin}/api/v1/prototype/photos`, { headers: { Authorization: `Bearer ${ownerCode}` } })).status(), 200)
    // Remount the team page so the one-time invitation secret is absent from screenshots.
    await openPresets(owner); await owner.getByRole('link', { name: 'Совместная работа', exact: true }).click()
    await expect(owner.locator('.invitation-code')).toHaveCount(0)
    await owner.setViewportSize({ width: 375, height: 812 })
    assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await viewer.setViewportSize({ width: 375, height: 812 }); await nav(viewer, 'Задания').click()
    assert.equal(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await owner.screenshot({ path: join(tmpdir(), `photobunker-team-${name}-mobile.png`), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(`${name}: viewer controls, revoked membership, retained unsent capture, direct-address denial and mobile collaboration layout passed`)
  } finally {
    if (ownerCode && a) {
      const response = await a.request.get(`${origin}/api/v1/prototype/photos`, { headers: { Authorization: `Bearer ${ownerCode}` } }).catch(() => undefined)
      if (response?.ok()) for (const photo of (await response.json()).photos) await a.request.delete(`${origin}/api/v1/prototype/photos/${photo.id}`, { headers: { Authorization: `Bearer ${ownerCode}` } }).catch(() => {})
    }
    await v?.close(); await b?.close(); await a?.close(); await rm(directory, { recursive: true, force: true })
  }
}
