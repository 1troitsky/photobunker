// Synthetic fixtures only. Screenshots contain deliberately public sample names.
import { chromium, webkit, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime } from './account-qa.mjs'
const ready = async f => { await f.page.goto(`${origin}/messages`); await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 }); await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-history-backup', 'true') }
async function profile(f, name, username) { const me = (await (await f.context.request.get(`${origin}/api/v1/identity/me`, { headers })).json()).account; assert.equal((await f.context.request.patch(`${origin}/api/v1/identity/profile`, { headers, data: { accountId: me.id, revision: me.revision, fields: { ...me.fields, name, username }, visibility: { ...me.visibility, name: 'public' } } })).status(), 200) }
async function send(f, text) { await label(f.page, 'Сообщение').fill(text); await button(f.page, 'Отправить').click(); await expect(f.page.locator('.message-body').filter({ hasText: text })).toBeVisible({ timeout: 30000 }) }
async function menu(page, text) { const message = page.locator('.message-bubble').filter({ hasText: text }); await message.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 100, clientY: 150 }); await expect(page.getByRole('dialog', { name: 'Действия с сообщением', exact: true })).toBeVisible(); await message.dispatchEvent('pointerup', { pointerType: 'touch', button: 0, clientX: 100, clientY: 150 }) }
for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true }), fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
  let stage = 'accounts', page
  try {
    const a = await accountFixture(browser, `${engine} messenger ui sender`, fixtures), b = await accountFixture(browser, `${engine} messenger ui receiver`, fixtures); page = a.page
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8)
    await profile(a, 'Александр Лебедев', `alex_${suffix}`); await profile(b, 'Мария Воронова', `maria_${suffix}`)
    for (const f of fixtures) await monitorRuntime(f.page, engine, errors, diagnostics)
    await ready(a); await ready(b)
    stage = 'new-message'
    await button(page, 'Новый чат').click(); await expect(page.getByRole('dialog', { name: 'Новое сообщение', exact: true })).toBeVisible()
    const lookup = label(page, 'ID или @username'), card = page.getByRole('article', { name: 'Найденный пользователь' })
    await lookup.fill('@missing_' + suffix)
    await expect(page.getByText('Пользователь не найден. Проверьте точный @username или публичный ID.', { exact: true })).toBeVisible()
    await expect(button(page, 'Написать')).toHaveCount(0)
    await lookup.fill(a.me.account.publicId)
    await expect(page.getByText('Пользователь не найден. Проверьте точный @username или публичный ID.', { exact: true })).toBeVisible()
    stage = 'lookup-retry'
    const failingLookup = '**/api/v1/identity/matrix/resolve/**'
    await page.route(failingLookup, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
    await lookup.fill(`@maria_${suffix}`)
    await expect(page.getByText('Не удалось найти пользователя. Проверьте соединение и повторите поиск.', { exact: true })).toBeVisible()
    await expect(button(page, 'Написать')).toHaveCount(0)
    await page.unroute(failingLookup); await button(page, 'Поиск').click()
    await expect(card).toContainText('Мария Воронова'); await expect(card).toContainText(b.me.account.publicId)
    await expect(button(card, 'Аудиозвонок')).toBeVisible()
    await lookup.fill(b.me.account.publicId); await expect(card).toHaveCount(0); await expect(card).toContainText('Мария Воронова')
    const matrixId = (await (await b.context.request.get(`${origin}/api/v1/identity/me`, { headers })).json()).account.matrix.userId
    assert.ok(matrixId)
    await lookup.fill(matrixId); await expect(card).toContainText(b.me.account.publicId)
    await page.setViewportSize({ width: 320, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ animations: 'disabled', path: `/private/tmp/photobunker-messenger-${engine}-person.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    stage = 'chat-retry'
    const failingChat = '**/api/v1/identity/matrix/conversations/prepare'
    await page.route(failingChat, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
    await button(card, 'Написать').click(); await expect(page.locator('.new-message-sheet .form-error')).toBeVisible(); await expect(card).toBeVisible()
    await page.unroute(failingChat)
    await button(card, 'Написать').click()
    await expect(page.locator('.message-composer')).toBeVisible()
     await b.page.locator('.chat-row').click();
    await expect(b.page.locator('.messenger-chat-header h1')).toHaveText('Александр Лебедев', { timeout: 30000 })
    stage = 'reopen-by-public-id'
    const firstRoom = await page.locator('.messages-screen').getAttribute('data-room')
    await page.locator('.messenger-chat-header').getByRole('button', { name: 'Назад', exact: true }).click()
    await button(page, 'Новый чат').click(); await lookup.fill(b.me.account.publicId); await expect(card).toContainText('Мария Воронова')
    await button(card, 'Написать').click(); await expect(page.locator('.messages-screen')).toHaveAttribute('data-room', firstRoom)
    stage = 'call-from-person'
    await page.locator('.messenger-chat-header').getByRole('button', { name: 'Назад', exact: true }).click()
    await button(page, 'Новый чат').click(); await lookup.fill(b.me.account.publicId); await expect(card).toContainText('Мария Воронова')
    await expect(button(card, 'Аудиозвонок')).toBeEnabled()
    // Synthetic denial checks that this action reaches real call setup without requesting a media admission.
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('QA permission denial', 'NotAllowedError') } })
    await button(card, 'Аудиозвонок').click()
    await expect(page.locator('.call-error')).toContainText(/Разрешите доступ|Браузер не поддерживает/, { timeout: 30000 })
    await expect(page.locator('.messages-screen')).toHaveAttribute('data-room', firstRoom)
    await button(page.locator('.call-error'), 'Закрыть').click()
    stage = 'conversation'
    await send(a, 'Привет! Снимки с сегодняшней съёмки готовы.'); await send(b, 'Отлично, спасибо! Посмотрю вечером.'); await send(a, 'Хорошо.'); await send(a, 'Если понадобятся изменения — напиши.')
    await expect(page.locator('.message-body')).toHaveCount(4)
    await expect(page.locator('.message-day')).toHaveCount(1)
    await expect(page.locator('.message-author')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Выбрать сообщения', exact: true })).toHaveCount(0)
    await expect(page.locator('.conversation-tools')).toHaveCount(0)
    await expect(page.locator('.message-mine').last().locator('.message-state')).toBeVisible()
    await expect(page.locator('nav.navigation')).toBeHidden()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ animations: 'disabled', path: `/private/tmp/photobunker-messenger-${engine}-chat.png` })
    stage = 'chatify-touch-actions'
    // A user on a phone must be able to discover actions with one tap.
    const latestMessage = page.locator('.message-bubble').filter({ hasText: 'Если понадобятся изменения' })
    const actionButton = latestMessage.getByRole('button', { name: 'Действия с сообщением' })
    await expect(actionButton).toBeVisible()
    const actionBox = await actionButton.boundingBox()
    assert.ok(actionBox && actionBox.width >= 36 && actionBox.height >= 36)
    assert.ok(actionBox.x >= 0 && actionBox.x + actionBox.width <= 390)
    await actionButton.click()
    await expect(page.getByRole('dialog', { name: 'Действия с сообщением', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Действия с сообщением', exact: true })).toHaveCount(0)
    stage = 'long-press-reply'
    await menu(page, 'Отлично, спасибо!'); await button(page, 'Ответить').click(); await expect(page.locator('.reply-preview')).toContainText('Посмотрю вечером')
    await send(a, 'Договорились!'); await expect(page.locator('.message-bubble').filter({ hasText: 'Договорились!' }).locator('blockquote')).toContainText('Посмотрю вечером')
    stage = 'pin'
    await menu(page, 'Снимки с сегодняшней'); await button(page, 'Закрепить').click(); await expect(page.locator('.pinned-strip')).toContainText('Снимки')
    await page.locator('.pinned-strip').click(); await expect(page.locator('.message-body')).toHaveCount(5)
    stage = 'message-search'
    await button(page, 'Поиск сообщений').click(); await label(page, 'Поиск сообщений').fill('вечером'); await expect(page.locator('.message-body')).toHaveCount(1)
    await button(page, 'Закрыть поиск').click(); await expect(page.locator('.message-body')).toHaveCount(5)
    stage = 'delete-incoming'
    await page.locator('.messenger-chat-header').getByRole('button', { name: 'Действия с чатом', exact: true }).click(); await button(page, 'Выбрать сообщения').click()
    await page.locator('.message-bubble').filter({ has: page.locator('.message-body').filter({ hasText: 'Отлично, спасибо!' }) }).getByRole('checkbox').check()
    await button(page, 'Удалить у всех').click(); await button(page.getByRole('dialog'), 'Удалить у всех').click()
    await expect(page.locator('.message-body').filter({ hasText: 'Отлично, спасибо!' })).toHaveCount(0)
    await expect(b.page.locator('.message-body').filter({ hasText: 'Отлично, спасибо!' })).toHaveCount(0, { timeout: 30000 })
    stage = 'draft'
    await label(page, 'Сообщение').fill('Черновик на потом')
    await page.locator('.messenger-chat-header').getByRole('button', { name: 'Назад', exact: true }).click()
    await page.locator('.chat-row').click(); await expect(label(page, 'Сообщение')).toHaveValue('Черновик на потом'); await label(page, 'Сообщение').fill('')
    stage = 'list-preview'
    await page.locator('.messenger-chat-header').getByRole('button', { name: 'Назад', exact: true }).click()
    await expect(page.locator('.chat-row')).toHaveCount(1); await expect(page.locator('.chat-summary')).toContainText('Договорились!')
    await expect(page.locator('.chat-summary')).not.toContainText('Защита переписки')
    await expect(page.locator('.chat-row time')).not.toBeEmpty()
    await page.screenshot({ animations: 'disabled', path: `/private/tmp/photobunker-messenger-${engine}-list.png` })
    stage = 'responsive'
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.locator('.chat-row').click(); await expect(page.locator('.message-composer')).toBeVisible()
      const composer = await page.locator('.message-composer').boundingBox(); assert.ok(composer.y >= 0 && composer.y + composer.height <= 845)
      if (width === 1440) { await expect(page.locator('.messenger-sidebar')).toBeVisible(); await page.screenshot({ animations: 'disabled', path: `/private/tmp/photobunker-messenger-${engine}-desktop.png` }); await page.evaluate(() => { document.documentElement.dataset.theme = 'light' }); await page.screenshot({ animations: 'disabled', path: `/private/tmp/photobunker-messenger-${engine}-desktop-light.png` }) }
      await page.evaluate(async () => { (await import('/src/messages/store.ts')).openRoom('') })
    }
    stage = 'reading-history'
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.chat-row').click()
    for (let index = 0; index < 14; index++) await send(a, `Тест истории ${index + 1}. Подробности съёмки и согласования оставим в этой переписке, чтобы вернуться к ним позже.`)
    await page.locator('.message-log').evaluate(log => { log.scrollTop = Math.max(120, (log.scrollHeight - log.clientHeight) / 3); log.dispatchEvent(new Event('scroll')) })
    const position = await page.locator('.message-log').evaluate(log => log.scrollTop)
    await send(b, 'Новое сообщение во время чтения истории')
    await expect(page.locator('.message-body').filter({ hasText: 'Новое сообщение во время чтения истории' })).toHaveCount(1)
    const actualPosition = await page.locator('.message-log').evaluate(log => log.scrollTop); assert.ok(Math.abs(actualPosition - position) < 3, `Scroll moved: ${Math.round(position)} -> ${Math.round(actualPosition)}`)
    await button(page, 'К последним сообщениям').click(); await expect(button(page, 'К последним сообщениям')).toHaveCount(0)
    stage = 'keyboard-height'
    await page.evaluate(() => { Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 440 }); window.visualViewport.dispatchEvent(new Event('resize')) })
    await expect.poll(async () => { const box = await page.locator('.message-composer').boundingBox(); return box.y + box.height }).toBeLessThanOrEqual(441)
    await page.evaluate(() => { delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize')) })
    assert.deepEqual(errors, [])
    console.log(`${engine}: native messenger list/preview, new-message flow, incoming name privacy, long-press reply/pin, focused search, incoming deletion for both, mobile full-height composer and desktop split view passed`)
  } catch (error) { console.error(`${engine}: messenger UI failed at ${stage} (${error.name}); ${error.stack?.match(/check-messenger-ui.mjs:\d+:\d+/)?.[0] ?? ''}`); console.error({ errors, diagnostics, path: page ? new URL(page.url()).pathname : '' }); throw new Error('messenger_ui_qa_failed') }
  finally { await cleanupFixtures(fixtures); await browser.close() }
}
