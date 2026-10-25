// Synthetic accounts only. Never output backup contents or plaintext payloads.
import { chromium, webkit, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime,labelQaDevice} from './account-qa.mjs'
const ready = async page => expect(page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 60000 })
for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true }), fixtures = [], extra = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
  let stage = 'registration', recoveryPage
  try {
    const first = await accountFixture(browser, `${engine} first-message sender`, fixtures), second = await accountFixture(browser, `${engine} first-message receiver`, fixtures)
    for (const f of fixtures) await monitorRuntime(f.page, engine, errors, diagnostics)
    assert.ok(first.photoKit.startsWith('PB4.'))
    await first.page.goto(`${origin}/gallery`)
    await expect(first.page.getByRole('heading', { name: 'Начать настройку', exact: true })).toHaveCount(0)
    await expect.poll(() => first.page.evaluate(async () => (await import('/src/crypto/store.ts')).photoReadAllowed())).toBe(true)
    stage = 'automatic-message-backup'
    const handle = 'qa_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12), me = second.me.account
    assert.equal((await second.context.request.patch(`${origin}/api/v1/identity/profile`, { headers, data: { accountId: me.id, revision: me.revision, fields: { ...me.fields, username: handle }, visibility: me.visibility } })).status(), 200)
    await first.page.goto(`${origin}/messages`); await ready(first.page)
    await expect(first.page.locator('.screen-header').getByRole('button', { name: 'Новый чат', exact: true })).toBeVisible()
    await expect(label(first.page, 'Поиск чатов и сообщений')).toBeVisible()
    await expect(first.page.locator('.messages-screen')).toHaveAttribute('data-history-backup', 'true')
    await button(first.page, 'Контакты').click()
    await label(first.page, 'Найти по ID').fill('@' + handle)
    await button(first.page, 'Поиск').click()
    await expect(first.page.locator('.person-screen')).toBeVisible()
    await button(first.page, 'Написать').click()
    await expect(first.page.locator('.message-composer')).toBeVisible({ timeout: 30000 })
    await second.page.goto(`${origin}/messages`); await ready(second.page)

    await expect(second.page.locator('.chat-row')).toHaveCount(1, { timeout: 30000 })
    await second.page.locator('.chat-row').click();
    await label(first.page, 'Сообщение').fill('QA first contact message'); await button(first.page, 'Отправить').click()
    await expect(second.page.locator('.message-body').filter({ hasText: 'QA first contact message' })).toBeVisible({ timeout: 30000 })
    stage = 'reopen'
    await first.page.reload(); await ready(first.page)
    await expect(first.page.locator('.chat-row')).toHaveCount(1)
    await first.page.locator('.chat-row').click()
    await expect(first.page.locator('.message-body').filter({ hasText: 'QA first contact message' })).toBeVisible({ timeout: 30000 })
    stage = 'responsive'
    await first.page.locator('.screen-header').getByRole('button', { name: 'Назад', exact: true }).click()
    for (const width of [320, 390, 768, 1440]) {
      await first.page.setViewportSize({ width, height: 844 })
      assert.ok(await first.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await first.page.locator('.screen-header').getByRole('button', { name: 'Новый чат', exact: true }).click()
      assert.ok(await first.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await button(first.page, 'Закрыть').click()
    }
    stage = 'one-key-recovery'
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 390, height: 844 } }), page = await context.newPage(); extra.push(context); recoveryPage = page
    await monitorRuntime(page, engine, errors, diagnostics)
    await page.goto(`${origin}/profile/account?mode=recover`)

    await label(page, 'Ключ аккаунта').fill(first.kit)
    await button(page, 'Готово').click(); await expect(page).toHaveURL(`${origin}/profile`, { timeout: 30000 });await labelQaDevice(page,`QA ${engine} combined backup recovery`);
    await page.goto(`${origin}/gallery`)
    await expect.poll(() => page.evaluate(async () => (await import('/src/crypto/store.ts')).photoReadAllowed())).toBe(true)
    await page.goto(`${origin}/messages`); await ready(page)
    await expect(button(page, 'Контакты')).toBeVisible()
    await expect(page.locator('.messages-screen')).toHaveAttribute('data-device-verified', 'true')
    await expect(page.locator('.messages-screen')).toHaveAttribute('data-history-backup', 'true')
    await page.locator('.chat-row').click()
    await expect(page.locator('.message-body').filter({hasText:'QA first contact message'})).toBeVisible({timeout:30000})
    await label(page, 'Сообщение').fill('QA verified second device message'); await button(page, 'Отправить').click()
    await expect(second.page.locator('.message-body').filter({hasText:'QA verified second device message'})).toBeVisible({timeout:30000})
    assert.deepEqual(errors, [])
    console.log(`${engine}: registration photo setup, first encrypted message from in-app contact search with automatic backup, reload, 320–1440 layouts, one-key photo/history recovery passed`)
  } catch (error) {
    console.error(`${engine}: onboarding QA failed at ${stage} (${error.name}); ${error.stack?.match(/check-onboarding-messages.mjs:\d+:\d+/)?.[0] ?? ''}`)
    console.error({ errors, diagnostics, security: await recoveryPage?.evaluate(async () => (await import('/src/messages/store.ts')).security.value), phase: await recoveryPage?.evaluate(async () => (await import('/src/messages/store.ts')).verificationPhase.value) }); throw new Error('onboarding_messages_qa_failed')
  } finally { for (const context of extra) await context.close(); await cleanupFixtures(fixtures); await browser.close() }
}
