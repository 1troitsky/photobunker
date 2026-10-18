// Synthetic accounts only; never print account keys, tokens or message bodies.
import { chromium, webkit, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime } from './account-qa.mjs'
import { capture, received } from './photo-qa.mjs'

for (const [engine, type] of Object.entries({ chromium, webkit })) {
  const browser = await type.launch({ headless: true }), fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
  let stage = 'register', latest
  try {
    const f = await accountFixture(browser, `${engine} data storage`, fixtures); latest = f.page
    await monitorRuntime(f.page, engine, errors, diagnostics)
    stage = 'message-backup'
    await f.page.goto(`${origin}/messages`)
    await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage', 'ready', { timeout: 90000 })
    await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-history-backup', 'true')
    const matrixSession = await (await f.context.request.post(`${origin}/api/v1/identity/matrix/session`, { headers })).json()
    stage = 'missing-camera-context'
    await f.page.evaluate(async id => { const db = await import('/src/crypto/database.ts'); await db.remove(`context:${id}:personal`) }, f.me.account.id)
    await f.page.reload()
    await capture(f)
    await expect(f.page).toHaveURL(`${origin}/camera`)
    await received(f, 1)
    stage = 'storage-settings'
    await f.page.goto(`${origin}/settings`)
    await f.page.getByRole('link', { name: /Данные и хранилище/ }).click()
    await expect(label(f.page, 'Дней без активности')).toHaveValue('180')
    await expect.poll(async () => (await (await f.context.request.get(`${origin}/api/v1/identity/storage`, { headers })).json()).ownedPhotos).toBe(1)
    await label(f.page, 'Дней без активности').fill('30')
    await button(f.page, 'Сохранить').click()
    await expect(f.page.getByRole('status').filter({ hasText: 'Срок автоудаления сохранён' })).toBeVisible()
    await f.page.reload()
    await expect(label(f.page, 'Дней без активности')).toHaveValue('30')
    await label(f.page, 'Дней без активности').fill('360'); await button(f.page, 'Сохранить').click()
    await expect(f.page.getByRole('status').filter({ hasText: 'Срок автоудаления сохранён' })).toBeVisible()
    stage = 'logout-warning-cancel'
    await f.page.goto(`${origin}/profile`); await button(f.page, 'Выйти').click()
    await expect(f.page.getByRole('dialog')).toContainText('доступ ко всем данным будет потерян')
    await button(f.page, 'Остаться в аккаунте').click()
    await expect(f.page.getByRole('dialog')).toHaveCount(0)
    assert.equal((await f.context.request.get(`${origin}/api/v1/identity/me`, { headers })).status(), 200)
    stage = 'delete-cancel'
    await f.page.goto(`${origin}/settings/data`); await expect(label(f.page, 'Дней без активности')).toHaveValue('360')
    await button(f.page, 'Удалить аккаунт и все данные').click()
    await expect(button(f.page, 'Удалить без возможности восстановления')).toBeDisabled()
    await button(f.page, 'Отмена').click()
    assert.equal((await f.context.request.get(`${origin}/api/v1/identity/me`, { headers })).status(), 200)
    stage = 'delete-account'
    await button(f.page, 'Удалить аккаунт и все данные').click()
    await label(f.page, 'Я понимаю, что восстановить данные будет невозможно').check()
    await button(f.page, 'Удалить без возможности восстановления').click()
    await expect(f.page).toHaveURL(`${origin}/profile`, { timeout: 30000 })
    await expect(button(f.page, 'Создать аккаунт')).toBeVisible()
    await expect(f.page.getByRole('status').filter({ hasText: 'Аккаунт закрыт' })).toBeVisible()
    await expect(button(f.page, 'Завершить очистку устройства')).toHaveCount(0)
    assert.equal((await f.context.request.get(`${origin}/api/v1/identity/me`, { headers })).status(), 401)
    assert.equal(await f.page.evaluate(async id => { const db = await import('/src/crypto/database.ts'); return (await db.entries('')).filter(row => row.key.split(':').includes(id)).length }, f.me.account.id), 0)
    stage = 'verified-server-cleanup'
    execFileSync('./scripts/dev', ['api', 'php', 'artisan', 'photobunker:account-maintain', `--account=${f.me.account.id}`], { stdio: 'pipe' })
    // Exact synthetic UUID/fingerprint: account-probe succeeds only if the
    // account disappeared or the remaining fixture was actually cleaned.
    const exists = execFileSync('./scripts/dev', ['api', 'php', '-r', 'require "vendor/autoload.php"; $app=require "bootstrap/app.php"; $app->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap(); echo Illuminate\\Support\\Facades\\DB::table("identity_accounts")->where("id", $argv[1])->exists() ? "pending" : "gone";', f.me.account.id], { encoding: 'utf8', stdio: 'pipe' })
    assert.equal(exists, 'gone')
    assert.equal((await f.context.request.get(`${origin}/_matrix/client/v3/account/whoami`, { headers: { Authorization: `Bearer ${matrixSession.accessToken}` } })).status(), 401)
    assert.deepEqual(errors, [])
    console.log(`${engine}: camera automatically prepares after reload, storage counts, 30–360 day policy, logout/delete cancellation and verified account cleanup passed`)
  } catch (error) {
    console.error(`${engine}: data-storage QA failed at ${stage} (${error.name}); ${error.stack?.match(/check-data-storage.mjs:\d+:\d+/)?.[0] ?? ''}`)
    console.error({ errors, diagnostics, path: latest ? new URL(latest.url()).pathname : '', visibleErrors: await latest?.locator('.form-error').count() })
    throw new Error('data_storage_qa_failed')
  } finally { await cleanupFixtures(fixtures); await browser.close() }
}
