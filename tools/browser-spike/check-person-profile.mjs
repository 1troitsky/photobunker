// Synthetic profiles only. Never print profile fields, account keys or Matrix tokens.
import { chromium, webkit, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime } from './account-qa.mjs'
async function ready(f) {
  await f.page.goto(`${origin}/messages`)
  await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
  await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-history-backup', 'true')
}
async function profile(f, name, username) {
  const me = (await (await f.context.request.get(`${origin}/api/v1/identity/me`, { headers })).json()).account
  assert.equal((await f.context.request.patch(`${origin}/api/v1/identity/profile`, { headers, data: {
    accountId: me.id, revision: me.revision,
    fields: { ...me.fields, name, username, email: 'qa@example.invalid', phone: '+10000000000', about: 'QA contacts only', links: 'QA private link' },
    visibility: { ...me.visibility, name: 'public', email: 'public', phone: 'contacts', about: 'contacts', links: 'private' },
  } })).status(), 200)
}
for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true }), fixtures = [], extra = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
  let stage = 'accounts'
  try {
    const a = await accountFixture(browser, `${engine} full profile sender`, fixtures), b = await accountFixture(browser, `${engine} full profile receiver`, fixtures)
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8), username = 'person_' + suffix
    await profile(a, 'Александр Лебедев', 'sender_' + suffix); await profile(b, 'Мария Воронова', username)
    for (const f of fixtures) await monitorRuntime(f.page, engine, errors, diagnostics)
    await ready(a)
    // The receiver has not opened Messages: the sender still must be able to start a conversation.
    stage = 'search-to-full-profile'
    await button(a.page, 'Новый чат').click(); await label(a.page, 'ID или @username').fill('@' + username)
    await button(a.page, 'Открыть профиль').click()
    await expect(a.page).toHaveURL(`${origin}/messages/profile/${b.me.account.publicId}`)
    const screen = a.page.locator('.person-screen')
    await expect(screen).toHaveAttribute('data-person', b.me.account.publicId)
    await expect(screen).toContainText('Мария Воронова'); await expect(screen).toContainText('qa@example.invalid')
    await expect(screen).not.toContainText('QA contacts only'); await expect(screen).not.toContainText('+10000000000'); await expect(screen).not.toContainText('QA private link')
    for (const name of ['Написать', 'Аудиозвонок', 'Добавить в контакты', 'Заблокировать']) await expect(button(screen, name)).toBeVisible()
    await expect(button(screen, 'Написать')).toBeEnabled()
    stage = 'share'
    await a.page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__qaProfileShare = data } }) })
    await button(screen, 'Поделиться профилем').last().click()
    const shared = await a.page.evaluate(() => window.__qaProfileShare)
    assert.equal(shared.url, `${origin}/people/${b.me.account.publicId}`)
    assert.deepEqual(Object.keys(shared).sort(), ['title', 'url'])
    assert.ok(!JSON.stringify(shared).includes('qa@example.invalid'))
    const guest = await browser.newContext({ locale: 'ru-RU' }); extra.push(guest)
    const guestPage = await guest.newPage(); await guestPage.goto(shared.url)
    await expect(guestPage.getByText('Войдите, чтобы открыть профиль и начать общение.', { exact: true })).toBeVisible()
    await expect(guestPage.locator('.person-information')).toHaveCount(0)
    await button(guestPage, 'Войти').click(); await expect(guestPage).toHaveURL(new RegExp('returnTo='))
    stage = 'personal-contacts'
    await button(screen, 'Добавить в контакты').click()
    await expect(screen).toContainText('В ваших контактах'); await expect(screen).not.toContainText('QA contacts only')
    await b.page.goto(`${origin}/people/${a.me.account.publicId}`)
    await button(b.page, 'Добавить в контакты').click()
    await expect(screen).toContainText('В ваших контактах', { timeout: 25000 })
    await expect(screen).toContainText('QA contacts only', { timeout: 25000 }); await expect(screen).toContainText('+10000000000')
    await expect(screen).not.toContainText('QA private link')
    for (const width of [320, 390, 768, 1440]) { await a.page.setViewportSize({ width, height: 844 }); assert.ok(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) }
    await a.page.setViewportSize({ width: 390, height: 844 })
    await a.page.screenshot({ animations: 'disabled', path: `/private/tmp/photobunker-person-profile-${engine}.png` })
    stage = 'remove-contact'
    await button(screen, 'Удалить контакт').click(); await button(a.page.getByRole('dialog'), 'Удалить контакт').click()
    await expect(screen).toContainText('QA contacts only', { timeout: 25000 }); await expect(screen).toContainText('+10000000000')
    await button(b.page, 'Удалить контакт').click(); await button(b.page.getByRole('dialog'), 'Удалить контакт').click()
    await expect(screen).not.toContainText('QA contacts only', { timeout: 25000 })
    await expect(button(screen, 'Добавить в контакты')).toBeVisible()
    stage = 'block-unblock'
    await button(screen, 'Заблокировать').click(); await button(a.page.getByRole('dialog'), 'Заблокировать').click()
    await expect(screen).toHaveAttribute('data-blocked', 'true'); await expect(button(screen, 'Написать')).toHaveCount(0)
    assert.equal((await b.context.request.get(`${origin}/api/v1/identity/people/${a.me.account.publicId}`, { headers })).status(), 404)
    await button(screen, 'Разблокировать').click(); await expect(screen).toHaveAttribute('data-blocked', 'false')
    await expect(button(screen, 'Написать')).toBeEnabled()
    stage = 'write-with-error-and-retry'
    const preparePath = '**/api/v1/identity/matrix/conversations/prepare'
    await a.page.route(preparePath, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"messaging_unavailable"}' }))
    await button(screen, 'Написать').click()
    await expect(a.page.locator('.messenger-opening')).toContainText('Не удалось', { timeout: 30000 })
    await expect(a.page.locator('.message-composer')).toHaveCount(0)
    await a.page.unroute(preparePath); await button(a.page.locator('.messenger-opening'), 'Повторить').click()
    await expect(a.page.locator('.message-composer')).toBeVisible({ timeout: 30000 })
    const room = await a.page.locator('.messages-screen').getAttribute('data-room')
    await label(a.page, 'Сообщение').fill('QA first message before receiver opens chat'); await button(a.page, 'Отправить').click()
    stage = 'reply-from-standalone-profile'
    await b.page.reload(); await expect(button(b.page, 'Написать')).toBeEnabled()
    await button(b.page, 'Написать').click()
    await expect(b.page.locator('.message-composer')).toBeVisible({ timeout: 90000 })
    await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-room', room)
    await expect(b.page.locator('.message-body').filter({ hasText: 'QA first message before receiver opens chat' })).toBeVisible({ timeout: 30000 })
    stage = 'encrypted-exchange'
    await label(a.page, 'Сообщение').fill('QA profile message'); await button(a.page, 'Отправить').click()
    await expect(b.page.locator('.message-body').filter({ hasText: 'QA profile message' })).toBeVisible({ timeout: 30000 })
    await label(b.page, 'Сообщение').fill('QA profile reply'); await button(b.page, 'Отправить').click()
    await expect(a.page.locator('.message-body').filter({ hasText: 'QA profile reply' })).toBeVisible({ timeout: 30000 })
    stage = 'chat-header-and-draft'
    await label(a.page, 'Сообщение').fill('QA draft stays in chat')
    await a.page.locator('.chat-heading').click(); await expect(screen).toHaveAttribute('data-person', b.me.account.publicId)
    await label(b.page, 'Сообщение').fill('QA while profile is open'); await button(b.page, 'Отправить').click()
    const unread = b.page.locator('.message-bubble').filter({ hasText: 'QA while profile is open' }).locator('.message-state')
    await expect(unread).toHaveAttribute('aria-label', 'Принято сервером', { timeout: 30000 })
    await button(screen, 'Назад').click(); await expect(label(a.page, 'Сообщение')).toHaveValue('QA draft stays in chat')
    await expect(unread).toHaveAttribute('aria-label', 'Прочитано', { timeout: 30000 })
    await label(a.page, 'Сообщение').fill('')
    stage = 'call-from-full-profile'
    await a.page.locator('.chat-heading').click(); await expect(button(screen, 'Аудиозвонок')).toBeEnabled()
    await a.page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('QA permission denial', 'NotAllowedError') } })
    await button(screen, 'Аудиозвонок').click()
    await expect(a.page.locator('.call-error')).toContainText(/Разрешите доступ|Браузер не поддерживает/, { timeout: 30000 })
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-room', room)
    stage = 'contacts-to-profile'
    await b.page.locator('.messenger-chat-header').getByRole('button', { name: 'Назад', exact: true }).click()
    await button(b.page, 'Контакты').click(); await label(b.page, 'Найти по ID').fill(a.me.account.publicId); await button(b.page, 'Поиск').click()
    await expect(b.page.locator('.person-screen')).toHaveAttribute('data-person', a.me.account.publicId)
    assert.deepEqual(errors, [])
    console.log(`${engine}: full profile/privacy, share/sign-in gate, personal add/remove, block/unblock, visible chat failure/retry, same-room reply, E2EE messages, chat-header profile/draft and call action passed`)
  } catch (error) {
    for (const [index, fixture] of fixtures.entries()) {
      const state = await fixture.page.evaluate(async () => { const store = await import('/src/messages/store.ts'); return { connection: store.connection.value, crypto: store.diagnostic.value, messages: store.messages.value.map(({ mine, locked, status }) => ({ mine, locked, status })) } }).catch(() => ({ unavailable: true }))
      console.error(JSON.stringify({ fixture: index, state }))
    }
    console.error(`${engine}: person profile QA failed at ${stage} (${error.name}); ${error.stack?.match(/check-person-profile.mjs:\d+:\d+/)?.[0] ?? ''}`)
    console.error({ errors, diagnostics }); throw new Error('person_profile_qa_failed')
  } finally { for (const context of extra) await context.close(); await cleanupFixtures(fixtures); await browser.close() }
}
