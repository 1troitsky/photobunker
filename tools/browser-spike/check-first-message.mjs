// Only synthetic identities; diagnostics contain enum states and event types, never content or keys.
import { chromium, webkit, expect } from '@playwright/test'
import { origin, headers, button, label, accountFixture, cleanupFixtures } from './account-qa.mjs'
for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true }), fixtures = []
  let stage = 'accounts'
  try {
    const a = await accountFixture(browser, `${engine} first message sender`, fixtures), b = await accountFixture(browser, `${engine} first message receiver`, fixtures)
    stage = 'profile-write'
    await a.page.goto(`${origin}/people/${encodeURIComponent(b.me.account.publicId)}`)
    await expect(button(a.page, 'Написать')).toBeVisible({ timeout: 30000 })
    await button(a.page, 'Написать').click()
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await expect(a.page.locator('.message-composer')).toBeVisible({ timeout: 45000 })
    const firstRoom = await a.page.locator('.messages-screen').getAttribute('data-room')
    if (!firstRoom) throw new Error('profile_write_no_room')
    stage = 'new-chat-existing-room'
    await a.page.goto(`${origin}/messages`)
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await button(a.page, 'Новый чат').click()
    await label(a.page, 'ID или @username').fill(b.me.account.publicId)
    await button(a.page, 'Написать').click()
    await expect(a.page.locator('.message-composer')).toBeVisible({ timeout: 45000 })
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-room', firstRoom)
    stage = 'first-send'
    await label(a.page, 'Сообщение').fill('QA first message before receiver starts messaging'); await button(a.page, 'Отправить').click()
    await expect(a.page.locator('.message-state')).toHaveAttribute('aria-label', 'Принято сервером', { timeout: 30000 })
    stage = 'first-receive'
    await b.page.goto(`${origin}/messages`); await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await expect(b.page.locator('.chat-row')).toHaveCount(1, { timeout: 30000 }); await b.page.locator('.chat-row').click()
    await expect(b.page.locator('.message-body').filter({ hasText: 'QA first message before receiver starts messaging' })).toBeVisible({ timeout: 30000 })
    await expect(a.page.locator('.message-state')).toHaveAttribute('aria-label', 'Прочитано', { timeout: 30000 })
    console.log(`${engine}: first encrypted message sent before receiver starts messaging is received automatically without invitation`)
  } catch (error) {
    for (const [index, f] of fixtures.entries()) {
      const state = await f.page.evaluate(async () => { const store = await import('/src/messages/store.ts'); return { connection: store.connection.value, crypto: store.diagnostic.value, older: store.olderAvailable.value, messages: store.messages.value.map(({ mine, locked, status, decryptionFailure }) => ({ mine, locked, status, decryptionFailure })) } }).catch(() => ({ unavailable: true }))
      const room = await f.page.locator('.messages-screen').getAttribute('data-room').catch(() => null)
      let wire
      if (room) {
        const session = await (await f.context.request.post(`${origin}/api/v1/identity/matrix/session`, { headers })).json()
        const response = await f.context.request.get(`${origin}/_matrix/client/v3/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=30`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
        const data = await response.json(); wire = { status: response.status(), types: data.chunk?.map(event => event.type) }; const event = data.chunk?.find(event => event.type === 'm.room.encrypted'); if (event) { const result = await (await f.context.request.post(`${origin}/_matrix/client/v3/keys/query`, { headers: { Authorization: `Bearer ${session.accessToken}` }, data: { device_keys: { [event.sender]: [] } } })).json(); const device = result.device_keys?.[event.sender]?.[event.content.device_id]; const signing = Object.keys(result.self_signing_keys?.[event.sender]?.keys || {})[0]; wire.senderSigned = !!device?.signatures?.[event.sender]?.[signing]; wire.senderKnown = !!device; }
      }
      console.error(JSON.stringify({ fixture: index, state, wire }))
    }
    console.error(`${engine}: first-message QA failed at ${stage} (${error.name})`); throw new Error('first_message_qa_failed')
  } finally { await cleanupFixtures(fixtures); await browser.close() }
}
