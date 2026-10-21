// Synthetic local-only Matrix E2EE QA: no plaintext/credentials in logs.
import { chromium, webkit, expect } from '@playwright/test'
import { origin, accountFixture, cleanupFixtures, monitorRuntime, label, button } from './account-qa.mjs'

for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true })
  const fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
  let stage = 'accounts'
  try {
    const a = await accountFixture(browser, `${engine} edit sender`, fixtures)
    const b = await accountFixture(browser, `${engine} reaction recipient`, fixtures)
    for (const account of fixtures) await monitorRuntime(account.page, engine, errors, diagnostics)
    await a.page.goto(`${origin}/messages`)
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await button(a.page, 'Новый чат').click()
    await label(a.page, 'ID или @username').fill(b.me.account.publicId)
    await button(a.page, 'Написать').click()
    await expect(a.page.locator('.message-composer')).toBeVisible({ timeout: 30000 })
    stage = 'initial-text'
    await label(a.page, 'Сообщение').fill('Synthetic original message')
    await button(a.page, 'Отправить').click()
    await expect(a.page.locator('.message-bubble').filter({ hasText: 'Synthetic original message' })).toHaveCount(1, { timeout: 35000 })
    await expect.poll(async () => a.page.evaluate(async () => {
      const store = await import('/src/messages/store.ts')
      return store.messages.value.some(row =>
        row.body === 'Synthetic original message' && store.canEditMessage(row.id))
    }), { timeout: 35000 }).toBe(true)
    stage = 'edit'
    const bubble = a.page.locator('.message-bubble').filter({ hasText: 'Synthetic original message' })
    await bubble.click({ button: 'right' })
    await button(a.page, 'Редактировать').click()
    await expect(label(a.page, 'Сообщение')).toHaveValue('Synthetic original message')
    await label(a.page, 'Сообщение').fill('Synthetic updated message')
    await button(a.page, 'Сохранить изменения').click()
    await expect(a.page.locator('.message-bubble').filter({ hasText: 'Synthetic updated message' })).toHaveCount(1, { timeout: 35000 })
    await expect(a.page.locator('.chatify-message-edited')).toHaveCount(1, { timeout: 35000 })
    await expect(a.page.locator('.message-bubble').filter({ hasText: 'Synthetic original message' })).toHaveCount(0)
    stage = 'receive'
    await b.page.goto(`${origin}/messages`)
    await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await expect(b.page.locator('.chat-row')).toHaveCount(1, { timeout: 35000 })
    await b.page.locator('.chat-row').click()
    await expect(b.page.locator('.message-bubble').filter({ hasText: 'Synthetic updated message' })).toHaveCount(1, { timeout: 35000 })
    stage = 'reaction'
    await b.page.locator('.message-bubble').filter({ hasText: 'Synthetic updated message' }).click({ button: 'right' })
    await button(b.page, 'Реакция').click()
    await button(b.page, 'Реакция: 👍').click()
    await expect(b.page.locator('.chatify-reaction-chip')).toHaveCount(1, { timeout: 35000 })
    await expect(a.page.locator('.chatify-reaction-chip')).toHaveCount(1, { timeout: 35000 })
    stage = 'reaction-toggle-off'
    await b.page.locator('.chatify-reaction-chip').click()
    await expect(b.page.locator('.chatify-reaction-chip')).toHaveCount(0, { timeout: 35000 })
    await expect(a.page.locator('.chatify-reaction-chip')).toHaveCount(0, { timeout: 35000 })
    expect(errors).toEqual([])
    console.log(`${engine}: E2EE edits and reaction toggle passed`)
  } catch (error) {
    console.error(`${engine}: edit/reaction QA failed at ${stage}:`, error instanceof Error ? error.name : 'unknown')
    console.error({ runtimeFailures: errors.length, stage })
    throw error
  } finally {
    await cleanupFixtures(fixtures)
    await browser.close()
  }
}
