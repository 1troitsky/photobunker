import { chromium, webkit, expect } from '@playwright/test'
import { origin, headers, button, label, accountFixture, cleanupFixtures, monitorRuntime } from './account-qa.mjs'
for (const engine of (process.env.APP_BROWSERS ?? 'chromium,webkit').split(',')) {
 const browser = await ({ chromium, webkit }[engine]).launch({ headless: true }), fixtures = [], errors = [], diagnostics = { nativePhotoPoll: 0 }
 let stage = 'accounts'; const media = []
 try {
  const a = await accountFixture(browser, `${engine} voice sender`, fixtures), b = await accountFixture(browser, `${engine} voice receiver`, fixtures)
  for (const f of [a,b]) { await monitorRuntime(f.page,engine,errors,diagnostics); f.page.on('response', response => { if (new URL(response.url()).pathname === '/_matrix/media/v3/upload') media.push({ status: response.status(), ciphertext: response.request().headers()['content-type'] === 'application/octet-stream' }) }) }
  await a.page.getByRole('link',{name:'Сообщения',exact:true}).click()
  await expect(a.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage','ready',{timeout:90000})
  await button(a.page,'Новый чат').click(); await label(a.page,'ID или @username').fill(b.me.account.publicId); await button(a.page,'Написать').click()
  await expect(a.page.locator('.message-composer')).toBeVisible({timeout:30000})
  await a.page.evaluate(() => {
   window.qaStreams = []
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:navigator.mediaDevices})
   const context = new AudioContext()
   document.addEventListener('pointerdown',()=>{void context.resume().catch(()=>{})})
   document.addEventListener('keydown',()=>{void context.resume().catch(()=>{})})
   navigator.mediaDevices.getUserMedia = async () => {
    window.qaSyntheticMediaStage = 'source'
    try {
      const oscillator = context.createOscillator(), destination = context.createMediaStreamDestination()
      oscillator.frequency.value = 440; oscillator.connect(destination); oscillator.start()
      const stream = destination.stream
      window.qaSyntheticMediaStage = 'track'
      const track = stream.getAudioTracks()[0]
      if (!track) throw new Error('synthetic_audio_track_unavailable')
      const stop = track.stop.bind(track)
      track.stop = () => { if (track.readyState !== 'ended') { stop(); oscillator.stop() } }
      window.qaStreams.push(stream)
      // WebKit can reject or defer AudioContext.resume() without a user gesture.
      // MediaRecorder should receive the synthetic MediaStream without waiting
      // for playback-policy decisions; the pointer handler also resumes it.
      window.qaSyntheticMediaStage = 'resume'
      void context.resume().catch(() => { window.qaSyntheticMediaResumeRejected = true })
      window.qaSyntheticMediaStage = 'ready'
      return stream
    } catch (error) {
      window.qaSyntheticMediaFailure = error instanceof Error ? error.name : 'unknown'
      throw error
    }
   }
  })
  stage = 'record-preview'
  await button(a.page,'Записать голосовое сообщение').click()
  await expect(a.page.locator('.voice-recorder')).toHaveAttribute('data-recording-state','recording')
  await expect.poll(() => a.page.locator('.voice-record-details strong').innerText()).not.toContain('0:00')
  await button(a.page,'Остановить запись').click(); await expect(a.page.locator('.voice-recorder audio')).toBeVisible()
  expect(await a.page.evaluate(() => window.qaStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')))).toBe(true)
  stage = 'voice-send'
  await button(a.page,'Отправить голосовое сообщение').click(); await expect(a.page.locator('.voice-message')).toHaveCount(1,{timeout:30000})
  await expect(a.page.locator('.voice-recorder')).toHaveAttribute('data-recording-state','idle')
  stage = 'receive-play'
  await b.page.goto(`${origin}/messages`); await expect(b.page.locator('.messages-screen')).toHaveAttribute('data-crypto-stage','ready',{timeout:90000})
  await expect(b.page.locator('.chat-row')).toHaveCount(1,{timeout:30000}); await b.page.locator('.chat-row').click()
  await expect(b.page.locator('.voice-message')).toHaveCount(1,{timeout:30000})
  await button(b.page,'Прослушать голосовое сообщение').click()
  await expect.poll(()=>b.page.locator('.voice-message audio').evaluate(audio=>!audio.paused)).toBe(true)
  await button(b.page,'Скорость воспроизведения').click(); expect(await b.page.locator('.voice-message audio').evaluate(audio=>audio.playbackRate)).toBe(1.5)
  stage = 'text-reply'
  await label(b.page,'Сообщение').fill('QA direct voice reply'); await button(b.page,'Отправить').click(); await expect(a.page.locator('.message-body').filter({hasText:'QA direct voice reply'})).toBeVisible({timeout:30000})
  stage = 'slide-cancel'
  const mic = await button(a.page,'Записать голосовое сообщение').boundingBox()
  await a.page.mouse.move(mic.x+mic.width/2,mic.y+mic.height/2); await a.page.mouse.down()
  await expect(a.page.locator('.voice-recorder')).toHaveAttribute('data-recording-state','recording')
  await a.page.mouse.move(mic.x-100,mic.y+mic.height/2); await a.page.mouse.up()
  await expect(a.page.locator('.voice-recorder')).toHaveAttribute('data-recording-state','idle')
  expect(await a.page.evaluate(()=>window.qaStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended')))).toBe(true)
  await expect(a.page.locator('.voice-message')).toHaveCount(1)
  stage = 'permission-denial'
  await a.page.evaluate(()=>{window.qaGUM=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('QA','NotAllowedError')}})
  await button(a.page,'Записать голосовое сообщение').click(); await expect(a.page.locator('.voice-error')).toContainText('Разрешите доступ')
  await a.page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.qaGUM})
  stage = 'failed-send-retry'
  const uploadPath='**/_matrix/media/v3/upload**'
  await a.page.route(uploadPath,route=>route.fulfill({status:503,contentType:'application/json',body:'{"errcode":"M_UNKNOWN","error":"QA unavailable"}'}))
  await button(a.page,'Записать голосовое сообщение').click(); await expect(a.page.locator('.voice-recorder')).toHaveAttribute('data-recording-state','recording')
  await expect.poll(()=>a.page.locator('.voice-record-details strong').innerText()).not.toContain('0:00')
  await button(a.page,'Пауза записи').click(); await expect(button(a.page,'Продолжить запись')).toBeVisible(); await button(a.page,'Продолжить запись').click()
  await button(a.page,'Остановить запись').click(); await button(a.page,'Отправить голосовое сообщение').click()
  await expect(a.page.locator('.voice-error')).toContainText('Не удалось отправить')
  await expect(a.page.locator('.voice-recorder audio')).toBeVisible()
  await a.page.unroute(uploadPath); await button(a.page,'Отправить голосовое сообщение').click()
  await expect(b.page.locator('.voice-message')).toHaveCount(2,{timeout:30000})
  stage = 'delete-incoming-for-everyone'
  await b.page.locator('.messenger-chat-header').getByRole('button',{name:'Действия с чатом',exact:true}).click(); await button(b.page,'Выбрать сообщения').click()
  await b.page.locator('.message-bubble').filter({has:b.page.locator('.voice-message')}).first().getByRole('checkbox').check()
  await button(b.page,'Удалить у всех').click(); await button(b.page.getByRole('dialog'),'Удалить у всех').click()
  await expect(a.page.locator('.voice-message')).toHaveCount(1,{timeout:30000}); await expect(b.page.locator('.voice-message')).toHaveCount(1)
  const encrypted = await a.page.evaluate(async () => {
   const url = performance.getEntriesByType('resource').map(entry => entry.name)
    .find(name => new URL(name).pathname === '/src/messages/store.ts')
   const store = await import(url || '/src/messages/store.ts')
   return store.messages.value.some(message=>message.voice && message.voice.file.v==='v2' && message.voice.file.url.startsWith('mxc://'))
  })
  expect(encrypted).toBe(true); expect(media).toEqual([{status:200,ciphertext:true},{status:503,ciphertext:true},{status:200,ciphertext:true}])
  expect(errors).toEqual([])
  console.log(`${engine}: voice record, preview, microphone release, encrypted send, automatic receive, playback, speed, text reply, slide cancel, permission denial, pause, failed-send retry and incoming deletion for everyone passed`)
 } catch(error) { for (const f of fixtures) console.error(await f.page.evaluate(async () => { const store = await import('/src/messages/store.ts'); return { phase: document.querySelector('.voice-recorder')?.getAttribute('data-recording-state'), messages: store.messages.value.map(value => ({ voice: !!value.voice, locked: value.locked, status: value.status, decryption: value.decryptionFailure })), error: !!document.querySelector('.voice-error'), synthetic: navigator.mediaDevices.getUserMedia.toString().includes('oscillator'), streams: window.qaStreams?.length, syntheticStage: window.qaSyntheticMediaStage, syntheticFailure: window.qaSyntheticMediaFailure, syntheticResumeRejected: !!window.qaSyntheticMediaResumeRejected } }).catch(()=>({ unavailable: true }))); console.error({ media }); console.error(`${engine}: voice QA failed at ${stage} (${error.name})`); throw error }
 finally { await cleanupFixtures(fixtures); await browser.close() }
}
