// Browser console for synthetic PhotoBunker accounts. Never opens an existing user's session.
// One JSON command per line. Account keys stay in this process and are never printed.
import { chromium, expect } from '@playwright/test'
import { createInterface } from 'node:readline'
import { origin, accountFixture, cleanupFixtures } from './account-qa.mjs'

const browser = await chromium.launch({
  headless: true,
  ...(process.env.APP_CHROME_CHANNEL ? { channel: process.env.APP_CHROME_CHANNEL } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const fixtures = []
const users = new Map()
const failures = new Map()
let sequence = 0

function user(alias) {
  const fixture = users.get(alias)
  if (!fixture) throw new Error('unknown_synthetic_user')
  return fixture
}

function locator(page, command) {
  const result = command.selector
    ? page.locator(command.selector)
    : command.label
      ? page.getByLabel(command.label, { exact: true })
      : page.getByRole(command.role || 'button', { name: command.name, exact: true })
  return result.nth(Number.isInteger(command.index) ? command.index : 0)
}

async function snapshot(alias, name = 'screen') {
  const safe = String(name).replace(/[^a-z0-9_-]/gi, '_').slice(0, 50)
  const path = `/private/tmp/photobunker-qa-${alias}-${safe}-${++sequence}.png`
  await user(alias).page.screenshot({ path, animations: 'disabled' })
  return path
}

async function inspect(alias) {
  const page = user(alias).page
  const state = await page.evaluate(() => ({
    screen: document.querySelector('.native-screen')?.getAttribute('class') || null,
    room: document.querySelector('.messages-screen')?.getAttribute('data-room') || null,
    connection: document.querySelector('.messages-screen')?.getAttribute('data-connection') || null,
    crypto: document.querySelector('.messages-screen')?.getAttribute('data-crypto-stage') || null,
    buttons: [...document.querySelectorAll('button')].filter(element => element.getClientRects().length).map(element => element.getAttribute('aria-label') || element.textContent?.trim()).filter(Boolean).slice(0, 40),
    alerts: [...document.querySelectorAll('[role="alert"]')].map(element => element.textContent?.trim().slice(0, 180)),
  }))
  return {
    url: page.url(),
    ...state,
    failedRequests: failures.get(alias)?.slice(-10) || [],
  }
}

async function execute(command) {
  const alias = String(command.user || '')
  if (command.op === 'fixture') {
    if (!/^[a-z][a-z0-9_-]{0,24}$/i.test(alias) || users.has(alias)) throw new Error('invalid_or_duplicate_alias')
    const fixture = await accountFixture(browser, `interactive ${alias}`, fixtures)
    fixture.page.setDefaultTimeout(15000)
    fixture.page.setDefaultNavigationTimeout(30000)
    users.set(alias, fixture)
    failures.set(alias, [])
    fixture.page.on('response', response => {
      if (response.status() < 400 || new URL(response.url()).origin !== origin) return
      failures.get(alias)?.push({ status: response.status(), path: new URL(response.url()).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, ':id') })
    })
    return { user: alias, publicId: fixture.me.account.publicId, url: fixture.page.url() }
  }
  if (command.op === 'exit') return { exit: true }
  const fixture = user(alias), page = fixture.page
  if (command.op === 'goto') {
    const target = new URL(String(command.path || '/'), origin)
    if (target.origin !== origin) throw new Error('outside_local_app')
    await page.goto(target.href)
    return await inspect(alias)
  }
  if (command.op === 'click') {
    await locator(page, command).click({ timeout: 30000 })
    if (command.waitPath) await page.waitForURL(new URL(String(command.waitPath), origin).href, { timeout: 30000 })
    return await inspect(alias)
  }
  if (command.op === 'fill') {
    await locator(page, command).fill(String(command.value ?? ''), { timeout: 30000 })
    return await inspect(alias)
  }
  if (command.op === 'press') {
    await locator(page, command).press(String(command.key), { timeout: 30000 })
    return await inspect(alias)
  }
  if (command.op === 'wait') {
    const target = locator(page, command), timeout = command.timeout || 30000
    if (command.attribute) await expect(target).toHaveAttribute(command.attribute, String(command.value), { timeout })
    else if (command.text) await expect(target).toContainText(String(command.text), { timeout })
    else await target.waitFor({ state: command.state || 'visible', timeout })
    return await inspect(alias)
  }
  if (command.op === 'inspect') return await inspect(alias)
  if (command.op === 'screenshot') return { path: await snapshot(alias, command.name) }
  throw new Error('unknown_command')
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
process.on('SIGINT', () => { input.close(); void browser.close() })
try {
  process.stdout.write(JSON.stringify({ ready: true, origin, camera: 'synthetic', channel: process.env.APP_CHROME_CHANNEL || 'playwright-chromium' }) + '\n')
  for await (const line of input) {
    let command
    let timer
    try {
      command = JSON.parse(line)
      const result = await Promise.race([
        execute(command),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('qa_timeout')), 60000) }),
      ])
      process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n')
      if (result.exit) break
    } catch (error) {
      let path
      if (error instanceof Error && error.message !== 'qa_timeout' && command?.user && users.has(command.user)) path = await snapshot(command.user, 'failure').catch(() => undefined)
      process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message === 'qa_timeout' ? 'qa_timeout' : error.name : 'failure', screenshot: path }) + '\n')
      if (error instanceof Error && error.message === 'qa_timeout') break
    } finally {
      clearTimeout(timer)
    }
  }
} finally {
  // Closing the browser first releases active synthetic camera tracks; a live
  // MediaStream can otherwise keep context.close pending indefinitely.
  await browser.close()
  await cleanupFixtures(fixtures)
  input.close()
  process.stdin.pause()
}
