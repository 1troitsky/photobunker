import { expect, test, chromium, firefox, webkit } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('ephemeral context matches measured capabilities and never turns a storage denial into success', async ({ page, browserName }) => {
  const external: string[] = []
  const errors: string[] = []
  page.on('request', request => { if (new URL(request.url()).origin !== 'http://127.0.0.1:5180') external.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'")
  expect(response?.headers()['content-security-policy']).not.toContain("'unsafe-eval'")
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('camera.must_not_be_requested') }
  })
  // The pinned WebKit's ephemeral profile cannot store a Blob (UnknownError)
  // on the measured macOS and Ubuntu environments.
  // Keep that negative finding explicit; the persistent-profile test below
  // must still pass the full suite, including process restart, on every engine.
  if (browserName === 'webkit') {
    await expect(page.evaluate(() => window.pbLab.runSynthetic())).rejects.toThrow('idb-commit')
    const report = await page.evaluate(() => window.pbLab.report)
    expect(report.results.map(result => result.code)).toEqual(['wasm-csp', 'sodium-worker', 'idb-commit'])
    expect(report.results[2]).toMatchObject({ status: 'fail', values: { errorName: 'UnknownError' } })
    const records = await page.evaluate(() => new Promise(resolve => {
      const request = indexedDB.open('photobunker-i02-synthetic-lab')
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['blobs', 'jobs'], 'readonly')
        const blob = tx.objectStore('blobs').get('committed')
        const job = tx.objectStore('jobs').get('committed')
        tx.oncomplete = () => { db.close(); resolve([blob.result, job.result]) }
      }
    }))
    expect(records).toEqual([undefined, undefined])
    expect(external).toEqual([])
    expect(errors).toEqual([])
    return
  }
  const report = await page.evaluate(() => window.pbLab.runSynthetic())
  expect(report.results).toHaveLength(8)
  expect(report.results.every(result => result.status === 'pass')).toBe(true)
  expect(report.results.find(result => result.code === 'sodium-worker')?.values).toMatchObject({ bytes: 8 * 1024 * 1024, finalVerified: true, tamperRejected: true, wrongRecipientRejected: true })
  await page.reload()
  const reopened = await page.evaluate(() => window.pbLab.readback())
  expect(reopened.results.map(result => result.code)).toEqual(['idb-after-reopen', 'upload-key-after-reopen'])
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('CSP without wasm-unsafe-eval blocks WASM compilation', async ({ page }) => {
  const response = await page.goto('/blocked.html')
  expect(response?.headers()['content-security-policy']).not.toContain('wasm-unsafe-eval')
  expect(await page.evaluate(() => window.pbLab.wasmProbe())).toBe(false)
})

test('Blob/job and non-extractable key survive an actual browser process restart', async ({ browserName }) => {
  const profile = await mkdtemp(join(tmpdir(), 'photobunker-i02-profile-'))
  const engine = { chromium, firefox, webkit }[browserName]
  let context = await engine.launchPersistentContext(profile, { headless: true })
  try {
    let page = await context.newPage()
    await page.goto('http://127.0.0.1:5180')
    const initial = await page.evaluate(() => window.pbLab.runSynthetic())
    expect(initial.results).toHaveLength(8)
    expect(initial.results.every(result => result.status === 'pass')).toBe(true)
    await context.close()
    context = await engine.launchPersistentContext(profile, { headless: true })
    page = await context.newPage()
    await page.goto('http://127.0.0.1:5180')
    const report = await page.evaluate(() => window.pbLab.readback())
    expect(report.results.every(result => result.status === 'pass')).toBe(true)
    await page.evaluate(() => window.pbLab.clearLab())
    await expect(page.evaluate(() => window.pbLab.readback())).rejects.toThrow()
  } finally { await context.close(); await rm(profile, { recursive: true, force: true }) }
})

test('explicit fake camera capture measures frames and stop ends its tracks', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Fake media device flags are Chromium-specific; real cameras remain pending.')
  await page.goto('/')
  await page.getByRole('button', { name: 'Включить камеру', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Измерить Canvas', exact: true })).toBeEnabled()
  await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('video')!.readyState >= 2)
  await page.getByRole('button', { name: 'Измерить Canvas', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.pbLab.report.results.some(result => result.code === 'camera-canvas' && result.status === 'pass'))).toBe(true)
  await page.evaluate(() => { (window as Window & { labTracks?: MediaStreamTrack[] }).labTracks = (document.querySelector<HTMLVideoElement>('video')!.srcObject as MediaStream).getTracks() })
  await page.getByRole('button', { name: 'Выключить камеру', exact: true }).click()
  expect(await page.evaluate(() => (window as Window & { labTracks?: MediaStreamTrack[] }).labTracks!.every(track => track.readyState === 'ended'))).toBe(true)
  expect(await page.locator('video').evaluate(video => (video as HTMLVideoElement).srcObject)).toBeNull()
})
