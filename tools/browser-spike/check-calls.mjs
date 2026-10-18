// Local synthetic accounts only. Never print JWTs, OpenID proofs, RTC keys, bodies or media.
import { chromium, webkit, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  origin,
  headers,
  button,
  label,
  accountFixture,
  cleanupFixtures,
  monitorRuntime,
} from './account-qa.mjs'
async function syntheticWebKit(page) {
  await page.evaluate(() => {
    const context = new AudioContext()
    document.addEventListener('pointerdown', () => {
      void context.resume().catch(() => {})
    })
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = new MediaStream()
      if (constraints.audio) {
        const oscillator = context.createOscillator(),
          output = context.createMediaStreamDestination()
        oscillator.frequency.value = 440
        oscillator.connect(output)
        oscillator.start()
        await context.resume()
        const track = output.stream.getAudioTracks()[0],
          stop = track.stop.bind(track)
        track.stop = () => {
          stop()
          oscillator.stop()
        }
        stream.addTrack(track)
      }
      if (constraints.video) {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        const context = canvas.getContext('2d')
        let count = 0
        const render = () => {
          context.fillStyle = count++ % 2 ? '#5636c9' : '#307949'
          context.fillRect(0, 0, 640, 480)
        }
        render()
        const timer = setInterval(render, 50),
          track = canvas.captureStream(20).getVideoTracks()[0],
          stop = track.stop.bind(track)
        track.stop = () => {
          clearInterval(timer)
          stop()
        }
        stream.addTrack(track)
      }
      return stream
    }
  })
}
async function protect(f) {
  await f.page.goto(`${origin}/messages`)
  await expect(f.page.locator('.messages-screen')).toHaveAttribute(
    'data-crypto-stage',
    'ready',
    { timeout: 60000 },
  )
  await expect(f.page.locator('.messages-screen')).toHaveAttribute('data-history-backup', 'true')
}
async function contact(a,b){for(const [owner,person] of [[a,b],[b,a]])assert.equal((await owner.context.request.post(`${origin}/api/v1/identity/contacts`,{headers,data:{publicId:person.me.account.publicId}})).status(),200)}

async function create(a, others, title = '') {
  const { page } = a
  if (await page.locator('.conversation').count())
    await page
      .locator('.screen-header')
      .getByRole('button', { name: 'Назад', exact: true })
      .click()
  await page
    .locator('.screen-header')
    .getByRole('button', { name: 'Новый чат', exact: true })
    .click()
  if (title) { await button(page, 'Создать группу').click(); await label(page, 'Название чата').fill(title) }
  if (title) {
    for (const f of others) await label(page, f.me.account.publicId).check()
    await button(page, 'Создать чат').click()
  } else { await label(page, 'ID или @username').fill(others[0].me.account.publicId); await button(page, 'Написать').click() }
  await expect(page.locator('.message-composer')).toBeVisible({
    timeout: 30000,
  })
}
async function accept(f, name) {
  if (await f.page.locator('.conversation').count())
    await f.page
      .locator('.screen-header')
      .getByRole('button', { name: 'Назад', exact: true })
      .click()

  await f.page.locator('.chat-row').filter({ hasText: name }).click()

  await expect(f.page.locator('.message-composer')).toBeVisible({
    timeout: 30000,
  })
}
for (const engine of (process.env.CALL_BROWSERS ?? 'chromium').split(',')) {
  const browser = await { chromium, webkit }[engine].launch({
      headless: true,
      ...(engine === 'chromium'
        ? {
            args: [
              '--use-fake-device-for-media-stream',
              '--use-fake-ui-for-media-stream',
              '--autoplay-policy=no-user-gesture-required',
            ],
          }
        : {}),
    }),
    fixtures = [],
    errors = [],
    diagnostics = { nativePhotoPoll: 0 },
    http = []
  let stage = 'accounts'
  try {
    const first = await accountFixture(
        browser,
        `${engine} call first`,
        fixtures,
      ),
      second = await accountFixture(browser, `${engine} call second`, fixtures),
      third = await accountFixture(browser, `${engine} call third`, fixtures)
    for (const f of fixtures) {
      f.page.setDefaultTimeout(15000)
      if (process.env.CALL_DIAGNOSTICS) {
        await f.page.exposeBinding('qaSafeCallFailure', (_s, data) => {
          diagnostics.failure = data
        })
        await f.page.route('**/src/calls/store.ts*', async (route) => {
          const response = await route.fetch()
          let body = await response.text()
          body = body.replace(
            'error.value = classify(failure);',
            'void window.qaSafeCallFailure({name:failure?.name,reason:failure?.reason,status:failure?.status,iceState:failure?.message?.match(/state: (new|checking|connected|completed|disconnected|failed|closed)/)?.[1],kind:["Websocket got closed","Websocket error","could not establish","cannot establish","no message received"].find(text=>failure?.message?.startsWith(text)),code:/^rtc[.][a-z_]+$/.test(failure?.message)?failure.message:undefined,frames:String(failure?.stack).split("\\n").slice(1,4).map(line=>line.trim().split(" (")[0].replace(/https?:.*/,"module"))});error.value = classify(failure);',
          )
          body = body.replace(
            'const membershipFailed = () => {',
            'const membershipFailed = (failure) => { void window.qaSafeCallFailure({event:"membership",name:failure?.cause?.name??failure?.name,code:failure?.cause?.errcode});',
          )
          body = body.replace(
            'local.room.on(lk.RoomEvent.Disconnected, () => {',
            'local.room.on(lk.RoomEvent.Disconnected, (reason) => { void window.qaSafeCallFailure({event:"disconnected",reason});',
          )
          await route.fulfill({ response, body })
        })
      }
      await monitorRuntime(f.page, engine, errors, diagnostics)
      f.page.on('response', (r) => {
        const path = new URL(r.url()).pathname
        if (
          (path.includes('/rtc/') ||
            path.includes('call.member') ||
            path.includes('delayed_events')) &&
          r.status() >= 400
        )
          http.push({
            status: r.status(),
            path: path.includes('/_matrix/')
              ? 'matrix-call-state'
              : path.replace(/[0-9a-f-]{36}/g, ':id'),
          })
      })
      await f.context.grantPermissions(['camera', 'microphone'], { origin })
      await protect(f)
      if (engine === 'webkit') await syntheticWebKit(f.page)
      await f.page.evaluate(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices,
        )
        window.qaCaptureTracks = []
        window.qaPeerConnections = []
        const Peer = window.RTCPeerConnection
        window.RTCPeerConnection = new Proxy(Peer, {
          construct(target, args) {
            const connection = Reflect.construct(target, args)
            window.qaPeerConnections.push(connection)
            return connection
          },
        })
        window.qaRtcSockets = []
        const Original = window.WebSocket
        window.WebSocket = class extends Original {
          constructor(...args) {
            super(...args)
            if (
              new URL(String(args[0]), location.href).pathname.startsWith(
                '/rtc/sfu/',
              )
            ) {
              window.qaRtcSockets.push(this)
              this.addEventListener('close', (event) => {
                window.qaWsClose ??= []
                window.qaWsClose.push({
                  code: event.code,
                  clean: event.wasClean,
                })
              })
            }
          }
        }
        navigator.mediaDevices.getUserMedia = async (options) => {
          const stream = await original(options)
          window.qaCaptureTracks.push(...stream.getTracks())
          return stream
        }
      })
    }
    await contact(first, second)
    await contact(first, third)
    console.log(`${engine}: protected test identities ready`)
    stage = 'create'
    await create(first, [second])
    await accept(second, first.me.account.publicId)
    stage = 'video-start'
    console.log(`${engine}: starting encrypted video`)
    await button(first.page, 'Видеозвонок').click()
    await expect(first.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 25000 },
    )
    stage = 'answer'
    await expect(second.page.locator('.incoming-call')).toBeVisible({
      timeout: 30000,
    })
    await button(second.page, 'Ответить').click()
    await expect(second.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 60000 },
    )
    for (const f of [first, second]) {
      await expect(f.page.locator('.call-screen')).toHaveAttribute(
        'data-call-encrypted',
        'true',
      )
      await expect(f.page.locator('.call-tile')).toHaveCount(2, {
        timeout: 30000,
      })
      await expect
        .poll(
          () =>
            f.page
              .locator('.call-screen video[data-local="false"]')
              .evaluateAll(
                (videos) =>
                  videos.filter((v) => v.readyState >= 2 && v.videoWidth > 0)
                    .length,
              ),
          { timeout: 30000 },
        )
        .toBeGreaterThan(0)
    }
    stage = 'audio-proof'
    for (const f of [first, second])
      await expect
        .poll(
          () =>
            f.page.evaluate(async () => {
              let energy = 0
              for (const connection of window.qaPeerConnections) {
                try {
                  const stats = await connection.getStats()
                  stats.forEach((report) => {
                    if (
                      report.type === 'inbound-rtp' &&
                      report.kind === 'audio'
                    )
                      energy += report.totalAudioEnergy ?? 0
                  })
                } catch {}
              }
              return energy
            }),
          { timeout: 20000 },
        )
        .toBeGreaterThan(0)
    console.log(
      `${engine}: two browsers connected and decoded remote video with MatrixRTC-distributed E2EE keys`,
    )
    stage = 'mute'
    await button(first.page, 'Микрофон').click()
    await expect(button(first.page, 'Микрофон')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await button(first.page, 'Камера').click()
    await expect(button(first.page, 'Камера')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await button(first.page, 'Камера').click()
    await expect(button(first.page, 'Камера')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    stage = 'reconnect'
    const sockets = await first.page.evaluate(() => window.qaRtcSockets.length)
    await first.page.evaluate(() =>
      window.qaRtcSockets.at(-1).close(4000, 'synthetic-network-drop'),
    )
    await expect
      .poll(() => first.page.evaluate(() => window.qaRtcSockets.length), {
        timeout: 20000,
      })
      .toBeGreaterThan(sockets)
    await expect(first.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 20000 },
    )
    stage = 'end'
    await button(first.page, 'Завершить звонок').click()
    await expect(first.page.locator('.call-screen')).toHaveCount(0, {
      timeout: 15000,
    })
    await button(second.page, 'Завершить звонок').click()
    await expect(second.page.locator('.call-screen')).toHaveCount(0, {
      timeout: 15000,
    })
    assert.deepEqual(errors, [])
    for (const f of [first, second])
      assert.equal(
        await f.page.evaluate(() =>
          window.qaCaptureTracks.every((track) => track.readyState === 'ended'),
        ),
        true,
      )
    console.log(
      `${engine}: video/audio E2EE, reconnect, microphone/camera toggles and capture release passed`,
    )
    stage = 'group-create'
    await create(first, [second, third], 'QA RTC group')
    await accept(second, 'QA RTC group')
    await accept(third, 'QA RTC group')
    stage = 'group-audio'
    await button(first.page, 'Аудиозвонок').click()
    await expect(first.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 30000 },
    )
    await button(second.page, 'Ответить').click()
    await expect(second.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 30000 },
    )
    await button(first.page, 'Камера').click()
    await expect(button(first.page, 'Камера')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    stage = 'no-key-observer'
    const roomId = await third.page
      .locator('.messages-screen')
      .getAttribute('data-room')
    const denied = await first.context.request.post(
      `${origin}/api/v1/identity/rtc/join`,
      { headers, data: { roomId: '!not-joined:matrix.photobunker.test' } },
    )
    http.push({ status: denied.status(), path: 'qa-foreign-room' })
    assert.equal(denied.status(), 403)
    const admissionResponse = await third.context.request.post(
      `${origin}/api/v1/identity/rtc/join`,
      { headers, data: { roomId } },
    )
    http.push({
      status: admissionResponse.status(),
      path: 'qa-observer-admission',
    })
    assert.equal(admissionResponse.status(), 200)
    const observerAdmission = await admissionResponse.json()
    await third.page.evaluate(async (admission) => {
      const { createMedia } = await import('/src/calls/media.ts')
      const observer = createMedia()
      window.qaObserver = observer
      window.qaObserverTracks = []
      observer.room.on('encryptionError', () => {})
      observer.room.on('trackSubscribed', (track) => {
        window.qaObserverTracks.push(track)
        if (track.kind === 'video') {
          const element = track.attach()
          element.style.cssText =
            'position:fixed;top:0;left:0;width:160px;height:120px;z-index:200'
          document.body.append(element)
        }
      })
      await observer.room.setE2EEEnabled(true)
      const url = new URL(admission.sfuPath, location.origin)
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      await observer.room.connect(url.href, admission.jwt, {
        rtcConfig: { iceServers: [] },
      })
    }, observerAdmission)
    const observerStats = () =>
      third.page.evaluate(async () => {
        let received = 0,
          decoded = 0
        for (const track of window.qaObserverTracks.filter(
          (t) => t.kind === 'video',
        )) {
          const stats = await track.getReceiverStats()
          received += stats?.bytesReceived ?? 0
          decoded += stats?.framesDecoded ?? 0
        }
        return {
          received,
          decoded,
          keys: window.qaObserver.provider.getKeys().length,
        }
      })
    await expect
      .poll(async () => (await observerStats()).received, { timeout: 20000 })
      .toBeGreaterThan(1000)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const proof = await observerStats()
    assert.equal(proof.decoded, 0)
    assert.equal(proof.keys, 0)
    await third.page.evaluate(async () => {
      await window.qaObserver.room.disconnect(true)
      window.qaObserver.worker.terminate()
      delete window.qaObserver
    })
    assert.ok(
      [200, 202].includes(
        (
          await third.context.request.delete(
            `${origin}/api/v1/identity/rtc/admissions/${observerAdmission.id}`,
            { headers },
          )
        ).status(),
      ),
    )
    stage = 'group-answer'
    await button(third.page, 'Ответить').click()
    await expect(third.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 30000 },
    )
    await button(third.page, 'Камера').click()
    for (const f of fixtures) {
      await expect(f.page.locator('.call-tile')).toHaveCount(3, {
        timeout: 30000,
      })
      await expect(f.page.locator('.call-screen')).toHaveAttribute(
        'data-call-encrypted',
        'true',
      )
      await expect
        .poll(
          () =>
            f.page
              .locator('.call-screen video[data-local="false"]')
              .evaluateAll(
                (v) =>
                  v.filter((el) => el.readyState >= 2 && el.videoWidth > 0)
                    .length,
              ),
          { timeout: 30000 },
        )
        .toBeGreaterThan(0)
    }
    stage = 'group-sizes'
    for (const width of [320, 390, 768, 1440]) {
      await first.page.setViewportSize({ width, height: 900 })
      assert.ok(
        await first.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      assert.ok(
        await first.page
          .locator('.call-controls')
          .evaluate(
            (el) => el.getBoundingClientRect().right <= window.innerWidth,
          ),
      )
    }
    stage = 'group-end'
    for (const f of fixtures) {
      await button(f.page, 'Завершить звонок').click()
      await expect(f.page.locator('.call-screen')).toHaveCount(0, {
        timeout: 10000,
      })
      assert.equal(
        await f.page.evaluate(() =>
          window.qaCaptureTracks.every((track) => track.readyState === 'ended'),
        ),
        true,
      )
    }
    stage = 'chat-sizes'
    for (const width of [320, 390, 768, 1440]) {
      await first.page.setViewportSize({ width, height: 900 })
      assert.ok(
        await first.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      assert.ok(
        await button(first.page, 'Видеозвонок').evaluate((el) => {
          const b = el.getBoundingClientRect()
          return b.left >= 0 && b.right <= window.innerWidth
        }),
      )
    }
    stage = 'denied-permission'
    await first.page.evaluate(() => {
      window.qaOriginalGUM = navigator.mediaDevices.getUserMedia
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Synthetic permission denied', 'NotAllowedError')
      }
    })
    await button(first.page, 'Аудиозвонок').click()
    await expect(first.page.locator('.call-error')).toContainText(
      'Разрешите доступ',
      { timeout: 30000 },
    )
    await expect(first.page.locator('.call-screen')).toHaveCount(0)
    await first.page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = window.qaOriginalGUM
    })
    await button(first.page, 'Закрыть').click()
    stage = 'server-unavailable'
    await first.page.route('**/api/v1/identity/rtc/join', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{}',
      }),
    )
    await button(first.page, 'Видеозвонок').click()
    await expect(first.page.locator('.call-error')).toContainText(
      'Проверьте сеть',
      { timeout: 15000 },
    )
    await first.page.unroute('**/api/v1/identity/rtc/join')
    await button(first.page, 'Закрыть').click()
    stage = 'pin-lock'
    await first.page.evaluate(async () => {
      const url = performance
        .getEntriesByType('resource')
        .find((entry) =>
          /\/src\/app\/lock.ts(?:[?]|$)/.test(
            new URL(entry.name).pathname + new URL(entry.name).search,
          ),
        ).name
      const lock = await import(url)
      await lock.setAppPin('624817')
      window.qaLock = lock
    })
    await button(first.page, 'Аудиозвонок').click()
    await expect(first.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 30000 },
    )
    await expect(third.page.locator('.incoming-call')).toBeVisible({
      timeout: 15000,
    })
    await button(third.page, 'Отклонить').click()
    await expect(third.page.locator('.incoming-call')).toHaveCount(0)
    await expect(first.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
    )
    await first.page.evaluate(() => window.qaLock.lockApp())
    await expect(label(first.page, 'PIN приложения')).toBeVisible()
    await expect(first.page.locator('.call-screen')).toHaveCount(0)
    assert.equal(
      await first.page.evaluate(() =>
        window.qaCaptureTracks.every((track) => track.readyState === 'ended'),
      ),
      true,
    )
    await label(first.page, 'PIN приложения').fill('624817')
    await button(first.page, 'Открыть приложение').click()
    await first.page.evaluate(() => window.qaLock.removeAppPin())
    stage = 'active-device-revoke'
    if (!(await first.page.locator('.conversation').count()))
      await first.page
        .locator('.chat-row')
        .filter({ hasText: 'QA RTC group' })
        .click()
    await expect(first.page.locator('.message-composer')).toBeVisible({
      timeout: 60000,
    })
    await button(first.page, 'Аудиозвонок').click()
    await expect(first.page.locator('.call-screen')).toHaveAttribute(
      'data-call-phase',
      'connected',
      { timeout: 30000 },
    )
    assert.equal(
      (
        await first.context.request.delete(
          `${origin}/api/v1/identity/devices/${first.me.deviceId}`,
          { headers },
        )
      ).status(),
      200,
    )
    await expect(first.page.locator('.call-screen')).toHaveCount(0, {
      timeout: 15000,
    })
    assert.equal(
      await first.page.evaluate(() =>
        window.qaCaptureTracks.every((track) => track.readyState === 'ended'),
      ),
      true,
    )
    assert.deepEqual(errors, [])
    console.log(
      `${engine}: group audio/video, 320–1440 px, no-key ciphertext observer, denied/outage/PIN/rejoin and active device revoke passed`,
    )
  } catch (e) {
    console.error(
      JSON.stringify({
        engine,
        stage,
        name: e.name,
        http,
        errors,
        diagnostics,
      }),
    )
    for (const f of fixtures)
      console.error({
        call: (await f.page.locator('.call-screen').count())
          ? await f.page.locator('.call-screen').getAttribute('data-call-phase')
          : null,
        error: await f.page.locator('.call-error').allTextContents(),
        sockets: await f.page.evaluate(() => window.qaWsClose ?? []),
        peers: await f.page.evaluate(() =>
          (window.qaPeerConnections ?? []).map((pc) => ({
            state: pc.connectionState,
            ice: pc.iceConnectionState,
            gathering: pc.iceGatheringState,
            transceivers: pc.getTransceivers().length,
          })),
        ),
      })
    console.error(
      String(e.stack)
        .split('\n')
        .filter(
          (l) => l.trim().startsWith('at ') && l.includes('check-calls.mjs'),
        )
        .join('\n'),
    )
    process.exitCode = 1
    break
  } finally {
    await cleanupFixtures(fixtures)
    await browser.close()
  }
}
