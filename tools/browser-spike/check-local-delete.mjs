// Synthetic browser drill for R1-07. Uses an isolated Playwright profile and
// UUID-only fixtures; it never signs in, mutates the API, or touches user data.
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

const origin = process.env.LOCAL_APP_URL ?? 'http://localhost:8080'
if (!['localhost', '127.0.0.1', '[::1]', 'photobunker.orb.local'].includes(new URL(origin).hostname))
  throw new Error('Use a loopback origin')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const DA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const DB = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ locale: 'ru-RU' })
const page = await context.newPage()

try {
  await page.goto(`${origin}/welcome`)
  const result = await page.evaluate(async ({ A, B, DA, DB }) => {
    const open = (name, version, upgrade) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version)
      request.onupgradeneeded = () => upgrade(request.result)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const seed = async (name, version, stores, rows) => {
      const database = await open(name, version, db => {
        for (const [store, options] of Object.entries(stores))
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, options)
      })
      await new Promise((resolve, reject) => {
        const tx = database.transaction(Object.keys(stores), 'readwrite')
        for (const [store, key, value] of rows) {
          const target = tx.objectStore(store)
          if (key === undefined) target.put(value)
          else target.put(value, key)
        }
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error)
      })
      database.close()
    }
    const keys = async (name, store) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const values = await new Promise((resolve, reject) => {
        const tx = database.transaction(store, 'readonly')
        const request = tx.objectStore(store).getAllKeys()
        tx.oncomplete = () => resolve(request.result.map(String).sort())
        tx.onabort = () => reject(tx.error)
      })
      database.close()
      return values
    }

    await seed('photobunker-identity-devices-v1', 2,
      { devices: { keyPath: 'id' }, pending: undefined }, [
        ['devices', undefined, { id: DA, publicId: 'pb_a' }],
        ['devices', undefined, { id: DB, publicId: 'pb_b' }],
        ['pending', 'root-a', { id: DA, publicId: 'pb_a' }],
        ['pending', 'root-b', { id: DB, publicId: 'pb_b' }],
      ])
    await seed('photobunker-message-outbox-v1', 1, { records: undefined }, [
      ['records', `key:${A}:${DA}`, 'a'], ['records', `key:${B}:${DB}`, 'b'],
      ['records', `msg:${A}:${DA}:pb-a`, 'a'], ['records', `msg:${B}:${DB}:pb-b`, 'b'],
    ])
    await seed('photobunker-message-storage-v1', 1, { keys: undefined }, [
      ['keys', `${A}:${DA}:matrix`, 'a'], ['keys', `${B}:${DB}:matrix`, 'b'],
    ])
    await seed('photobunker-private-messenger-folders-v1', 1, { private: undefined }, [
      ['private', `key:${A}:${DA}`, 'a'], ['private', `data:${A}:${DA}`, 'a'],
      ['private', `key:${B}:${DB}`, 'b'], ['private', `data:${B}:${DB}`, 'b'],
    ])
    await seed('photobunker-team-cache-v1', 1, { scopes: undefined }, [
      ['scopes', `team:${A}:${DA}`, 'a'], ['scopes', `team:${B}:${DB}`, 'b'],
    ])
    await seed('photobunker-photo-browser-cache-v1', 1, { records: undefined }, [
      ['records', `browser:${A}:${DA}:a`, 'a'], ['records', `browser:${B}:${DB}:b`, 'b'],
    ])
    await seed('photobunker-photo-names-v1', 1, { scopes: undefined }, [
      ['scopes', `photo-names:${A}:${DA}`, 'a'], ['scopes', `photo-names:${B}:${DB}`, 'b'],
    ])
    await seed('photobunker-card-share-intents-v1', 1, { records: undefined }, [
      ['records', `${A}:${DA}:a`, 'a'], ['records', `${B}:${DB}:b`, 'b'],
    ])
    await seed('photobunker-private-presence-v1', 1, { records: undefined }, [
      ['records', `${A}:${DA}`, 'a'], ['records', `${B}:${DB}`, 'b'],
    ])
    await seed('photobunker-app-pin-v2', 1, { records: undefined }, [
      ['records', `app-pin:${A}:${DA}`, 'a'], ['records', `app-pin:${B}:${DB}`, 'b'],
    ])
    await seed('photobunker-local-delete-v1', 1, { pins: undefined, journal: undefined }, [
      ['pins', `local-delete:${A}:${DA}`, 'a'], ['pins', `local-delete:${B}:${DB}`, 'b'],
    ])
    await seed('photobunker-encrypted-queue-v1', 1, { entries: undefined }, [
      ['entries', `job:${A}:a`, 'a'], ['entries', `job:${B}:b`, 'b'],
    ])
    await seed('photobunker-ui-workspace-v1', 1, { records: { keyPath: 'key' } }, [
      ['records', undefined, { key: `account:${A}:tasks:a`, scope: `account:${A}` }],
      ['records', undefined, { key: `account:${B}:tasks:b`, scope: `account:${B}` }],
    ])
    await seed('photobunker-local-prototype-v1', 1,
      { photos: undefined, originals: undefined, thumbnails: undefined }, [
        ['photos', 'photo-a', { id: 'photo-a', accountId: A }],
        ['photos', 'photo-b', { id: 'photo-b', accountId: B }],
        ['originals', 'photo-a', new Blob(['a'])], ['originals', 'photo-b', new Blob(['b'])],
        ['thumbnails', 'photo-a', new Blob(['a'])], ['thumbnails', 'photo-b', new Blob(['b'])],
      ])
    await seed(`photobunker-matrix-${A}:${DA}:synthetic`, 1, { crypto: undefined },
      [['crypto', 'a', 'a']])
    await seed(`photobunker-matrix-${B}:${DB}:synthetic`, 1, { crypto: undefined },
      [['crypto', 'b', 'b']])

    const deletion = await import('/src/app/local-delete-run.ts')
    await deletion.purgeLocalDeleteScope({ owner: A, device: DA })
    const names = (await indexedDB.databases()).map(row => row.name)
    return {
      identity: await keys('photobunker-identity-devices-v1', 'devices'),
      identityPending: await keys('photobunker-identity-devices-v1', 'pending'),
      outbox: await keys('photobunker-message-outbox-v1', 'records'),
      messageKeys: await keys('photobunker-message-storage-v1', 'keys'),
      folders: await keys('photobunker-private-messenger-folders-v1', 'private'),
      teams: await keys('photobunker-team-cache-v1', 'scopes'),
      browser: await keys('photobunker-photo-browser-cache-v1', 'records'),
      names: await keys('photobunker-photo-names-v1', 'scopes'),
      shares: await keys('photobunker-card-share-intents-v1', 'records'),
      presence: await keys('photobunker-private-presence-v1', 'records'),
      appPins: await keys('photobunker-app-pin-v2', 'records'),
      deletePins: await keys('photobunker-local-delete-v1', 'pins'),
      workspace: await keys('photobunker-ui-workspace-v1', 'records'),
      photos: await keys('photobunker-local-prototype-v1', 'photos'),
      originals: await keys('photobunker-local-prototype-v1', 'originals'),
      thumbnails: await keys('photobunker-local-prototype-v1', 'thumbnails'),
      encrypted: await keys('photobunker-encrypted-queue-v1', 'entries'),
      matrixA: names.includes(`photobunker-matrix-${A}:${DA}:synthetic`),
      matrixB: names.includes(`photobunker-matrix-${B}:${DB}:synthetic`),
      signedOut: localStorage.getItem('pb-local-delete-signed-out'),
    }
  }, { A, B, DA, DB })

  assert.deepEqual(result, {
    identity: [DB],
    identityPending: ['root-b'],
    outbox: [`key:${B}:${DB}`, `msg:${B}:${DB}:pb-b`],
    messageKeys: [`${B}:${DB}:matrix`],
    folders: [`data:${B}:${DB}`, `key:${B}:${DB}`],
    teams: [`team:${B}:${DB}`],
    browser: [`browser:${B}:${DB}:b`],
    names: [`photo-names:${B}:${DB}`],
    shares: [`${B}:${DB}:b`],
    presence: [`${B}:${DB}`],
    appPins: [`app-pin:${B}:${DB}`],
    deletePins: [`local-delete:${B}:${DB}`],
    workspace: [`account:${B}:tasks:b`],
    photos: ['photo-b'],
    originals: ['photo-b'],
    thumbnails: ['photo-b'],
    encrypted: [`job:${B}:b`],
    matrixA: false,
    matrixB: true,
    signedOut: 'true',
  })

  const gate = await browser.newContext({ locale: 'ru-RU' })
  const gated = await gate.newPage()
  await gated.goto(`${origin}/welcome`)
  await gated.evaluate(async () => {
    const request = indexedDB.open('photobunker-local-delete-v1', 1)
    await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        request.result.createObjectStore('pins')
        request.result.createObjectStore('journal')
      }
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
    const database = request.result
    await new Promise((resolve, reject) => {
      const tx = database.transaction('journal', 'readwrite')
      tx.objectStore('journal').put({ invalid: true }, 'active')
      tx.oncomplete = resolve
      tx.onabort = () => reject(tx.error)
    })
    database.close()
  })
  await gated.reload()
  await expect(gated.getByText('Локальная очистка не завершена')).toBeVisible()
  await expect(gated.locator('main')).not.toContainText('Добро пожаловать')
  await gate.close()

  console.log('chromium: scoped local wipe preserves account B and invalid/crashed journal blocks private routing')
} finally {
  await context.close()
  await browser.close()
}
