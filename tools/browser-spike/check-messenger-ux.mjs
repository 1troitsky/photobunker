// Local synthetic accounts only. Never log chat plaintext, room IDs or keys.
import { chromium, webkit, expect } from '@playwright/test'
import { origin, accountFixture, cleanupFixtures, monitorRuntime, button, label } from './account-qa.mjs'

for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true })
  const fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
  let stage = 'accounts'
  try {
    const a = await accountFixture(browser, `${engine} folders creator`, fixtures)
    const b = await accountFixture(browser, `${engine} folders contact`, fixtures)
    for (const item of fixtures) await monitorRuntime(item.page, engine, errors, diagnostics)
    await a.page.goto(`${origin}/messages`)
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    stage = 'custom-folder'
    await button(a.page, 'Папки чатов').click()
    await label(a.page, 'Название папки').fill('Synthetic private')
    await button(a.page, 'Создать папку').click()
    await expect(a.page.locator('.chatify-folder-row')).toContainText('Synthetic private')
    await button(a.page, 'Закрыть').last().click()
    stage = 'create-chat'
    await button(a.page, 'Новый чат').click()
    await label(a.page, 'ID или @username').fill(b.me.account.publicId)
    await button(a.page, 'Написать').click()
    await expect(a.page.locator('.message-composer')).toBeVisible({ timeout: 30000 })
    stage = 'emoji-compose'
    await button(a.page, 'Emoji и стикеры').click()
    await button(a.page, 'Emoji: 🔥').click()
    await expect(label(a.page, 'Сообщение')).toHaveValue('🔥')
    stage = 'sticker-preparation'
    await button(a.page, 'Emoji и стикеры').click()
    await button(a.page, 'Стикеры').click()
    await button(a.page, 'Стикеры: 😍').click()
    await expect(a.page.locator('.chatify-composer-attachment')).toContainText('sticker.png')
    stage = 'assign-folder'
    await a.page.locator('.chat-row-menu').first().click()
    await a.page.getByRole('button', { name: /Synthetic private.*Добавить в папку/ }).click()
    await button(a.page, 'Закрыть').last().click()
    await a.page.locator('.messenger-filters').getByRole('button', { name: 'Synthetic private' }).click()
    await expect(a.page.locator('.chat-row')).toHaveCount(1)
    stage = 'mute-notifications'
    await a.page.locator('.chat-row-menu').first().click()
    await button(a.page, 'Отключить уведомления').click()
    await expect(a.page.locator('.chat-muted-icon')).toHaveCount(1, { timeout: 20000 })
    stage = 'reload-folder'
    await a.page.reload()
    await expect(a.page.locator('.messenger-filters').getByRole('button', { name: 'Synthetic private' })).toHaveCount(1, { timeout: 30000 })
    expect(errors).toEqual([])
    console.log(`${engine}: private folder CRUD assignment, emoji/sticker and Matrix push mute passed`)
  } catch (error) {
    console.error(`${engine}: messenger UX failed at ${stage} (${error instanceof Error ? error.name : 'unknown'})`)
    console.error({ runtimeFailures: errors.length })
    throw error
  } finally {
    await cleanupFixtures(fixtures)
    await browser.close()
  }
}
