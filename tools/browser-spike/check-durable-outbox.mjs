// Synthetic E2EE outbox acceptance; no user credentials, plaintext, or
// account identifiers printed to logs. This does not assert offline history cache.
import { chromium, webkit, expect } from '@playwright/test'
import { origin, accountFixture, cleanupFixtures, button, label } from './account-qa.mjs'

for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
  const browser = await ({ chromium, webkit }[engine]).launch({ headless: true })
  const fixtures = []
  let stage = 'accounts'
  try {
    const a = await accountFixture(browser, `${engine} encrypted outbox sender`, fixtures)
    const b = await accountFixture(browser, `${engine} encrypted outbox recipient`, fixtures)
    stage = 'create-room'
    await a.page.goto(`${origin}/messages`)
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await button(a.page, 'Новый чат').click()
    await label(a.page, 'ID или @username').fill(b.me.account.publicId)
    await button(a.page, 'Написать').click()
    await expect(a.page.locator('.message-composer')).toBeVisible({ timeout: 45000 })
    // First canonical E2EE exchange proves joined room and established crypto.
    stage = 'first-ack'
    await label(a.page, 'Сообщение').fill('Synthetic warmup')
    await button(a.page, 'Отправить').click()
    await expect(a.page.locator('.message-bubble').filter({ hasText: 'Synthetic warmup' }).locator('.message-state-sent')).toBeVisible({ timeout: 45000 })
    stage = 'offline-queue'
    await a.context.setOffline(true)
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-connection', 'offline', { timeout: 60000 })
    await label(a.page, 'Сообщение').fill('Synthetic durable offline text')
    await expect(button(a.page, 'Отправить')).toBeEnabled()
    await button(a.page, 'Отправить').click()
    const queued = a.page.locator('.message-bubble').filter({ hasText: 'Synthetic durable offline text' })
    await expect(queued).toHaveCount(1, { timeout: 20000 })
    await expect(queued.locator('.message-state-queued')).toBeVisible()
    await expect(label(a.page, 'Сообщение')).toHaveValue('')
    // Verify IndexedDB row contains AES-GCM bytes, not a string body.
    stage = 'ciphertext-persistence'
    await expect.poll(async () => a.page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('photobunker-message-outbox-v1')
        req.onsuccess = () => resolve(req.result)
        req.onerror = reject
      })
      try {
        const items = await new Promise((resolve, reject) => {
          const tx = db.transaction('records', 'readonly')
          const request = tx.objectStore('records').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = reject
        })
        return items.some(item => item?.version === 1 &&
          item.ciphertext instanceof ArrayBuffer && item.ciphertext.byteLength > 0 &&
          item.iv instanceof Uint8Array && item.iv.length === 12)
      } finally { db.close() }
    }), { timeout: 20000 }).toBe(true)
    // Close while disconnected: it must not drop the operation or send without keys.
    stage = 'reload-after-disconnect'
    await a.page.reload()
    await a.context.setOffline(false)
    await a.page.reload()
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    stage = 'reconcile-server'
    await b.page.goto(`${origin}/messages`)
    await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await expect(b.page.locator('.chat-row')).toHaveCount(1, { timeout: 60000 })
    await b.page.locator('.chat-row').first().click()
    await expect(b.page.locator('.message-bubble').filter({ hasText: 'Synthetic durable offline text' })).toHaveCount(1, { timeout: 60000 })
    // Late Matrix sync or repeated reload may not create a second copy.
    await a.page.reload()
    await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await b.page.reload()
    await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await b.page.locator('.chat-row').first().click()
    await expect(b.page.locator('.message-bubble').filter({ hasText: 'Synthetic durable offline text' })).toHaveCount(1)
    console.log(`${engine}: encrypted durable text survived offline reload, retried with one Matrix txn, decrypted once`)
  } catch (error) {
    console.error(`${engine}: encrypted outbox QA failed at ${stage} (${error instanceof Error ? error.name : 'unknown'})`)
    throw new Error('durable_outbox_qa_failed')
  } finally {
    await cleanupFixtures(fixtures)
    await browser.close()
  }
}
