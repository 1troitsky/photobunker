import { abortSynthetic, clearLab, saveSynthetic, saveUploadKey, verifySynthetic, verifyUploadKey } from './storage'
import { canvasCapture, startCamera, stillCapture, stopCamera, syntheticCanvas } from './camera'
import './style.css'

type Value = string | number | boolean | undefined
type Result = { code: string; status: 'pass' | 'fail'; values?: Record<string, Value> }
const report = {
  schema: 'photobunker-browser-spike/v1',
  harnessVersion: '0.1.0',
  testedAt: new Date().toISOString(),
  browser: navigator.userAgent,
  capabilities: {
    secureContext: isSecureContext,
    indexedDB: 'indexedDB' in window,
    webCrypto: Boolean(crypto?.subtle),
    webAssembly: 'WebAssembly' in window,
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
    imageCapture: 'ImageCapture' in window,
    storageEstimate: Boolean(navigator.storage?.estimate),
    storagePersist: Boolean(navigator.storage?.persist),
    standalone: matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  },
  results: [] as Result[],
  lifecycle: [] as { event: string; elapsedMs: number }[],
  pending: ['real-ios-installed-pwa', 'real-android-installed-pwa', 'physical-camera-orientation-quality', 'process-kill-mid-write', 'quota-exhaustion-eviction', 'peak-memory-on-device', 'product-protocol-security-review'],
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main>
    <p class="eyebrow">PhotoBunker / I02 / developer tool</p>
    <h1>Browser compatibility lab</h1>
    <p>Изолированный стенд. Это не камера приложения и не реализация E2EE. Автоматические пробы используют только синтетические bytes, ничего не отправляют серверу и не запрашивают камеру/GPS.</p>
    <section aria-labelledby="synthetic-title">
      <h2 id="synthetic-title">Синтетические проверки</h2>
      <div class="actions">
        <button id="run">Запустить пробы</button>
        <button id="readback">Проверить после reload</button>
        <button id="persist">Запросить persistent storage</button>
        <button id="clear">Очистить данные стенда</button>
      </div>
      <p>Проверяются WASM под CSP, libsodium в worker, 4 MiB Blob + job в одной IDB transaction, abort и сохранение non-extractable upload-auth key. Transaction complete не доказывает устойчивость к сбою питания или eviction.</p>
    </section>
    <section aria-labelledby="camera-title">
      <h2 id="camera-title">Ручная камера</h2>
      <p>Для проверки используйте тестовую карточку без людей и личных данных. Preview и кадр существуют только в памяти; сохраняются в отчёт лишь размеры/метод. Системная галерея и файловый input не используются.</p>
      <video id="camera" muted playsinline aria-label="Live test-card camera preview"></video>
      <div class="actions"><button id="start-camera">Включить камеру</button><button id="canvas" disabled>Измерить Canvas</button><button id="still" disabled>Измерить takePhoto</button><button id="stop-camera" disabled>Выключить камеру</button></div>
      <p>Отсутствие ImageCapture — допустимый результат. Качество и ориентация физической камеры подтверждаются вручную в portrait/landscape. Background/pagehide останавливает tracks.</p>
    </section>
    <section aria-labelledby="report-title">
      <h2 id="report-title">Локальный отчёт</h2>
      <p id="status" role="status" aria-live="polite">Готов к проверкам. Камера выключена.</p>
      <button id="download">Скачать JSON отчёт</button>
      <pre id="report"></pre>
    </section>
  </main>`

const video = document.querySelector<HTMLVideoElement>('#camera')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const output = document.querySelector<HTMLPreElement>('#report')!
let activeWorker: Worker | undefined
let cancelWorker: (() => void) | undefined
let busy = false
function render() { output.textContent = JSON.stringify(report, null, 2) }
function record(code: string, values: Record<string, Value>) { report.results.push({ code, status: 'pass', values }); render() }
function cameraButtons(active: boolean) {
  for (const id of ['canvas', 'stop-camera']) document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled = !active
  document.querySelector<HTMLButtonElement>('#still')!.disabled = !active || !('ImageCapture' in window)
}
function stop() { stopCamera(video); cameraButtons(false) }

export async function wasmProbe() {
  // Empty valid WASM module; compile is still subject to script-src policy.
  try { await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); return true }
  catch { return false }
}

async function workerProbe(): Promise<Record<string, Value>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./crypto-worker.ts', import.meta.url), { type: 'module' })
    activeWorker = worker
    const timer = setTimeout(() => { finish(); reject(new Error('crypto.timeout')) }, 30_000)
    const finish = () => { clearTimeout(timer); worker.terminate(); if (activeWorker === worker) { activeWorker = undefined; cancelWorker = undefined } }
    cancelWorker = () => { finish(); reject(new Error('crypto.cancelled')) }
    worker.onmessage = event => { finish(); event.data.ok ? resolve(event.data.data) : reject(new Error('crypto.library_probe_failed')) }
    worker.onerror = event => { event.preventDefault(); finish(); reject(new Error('crypto.worker_failed')) }
    worker.postMessage({ probe: 'library-apis' })
  })
}

async function perform(code: string, action: () => Promise<Record<string, Value>>) {
  try { const values = await action(); record(code, values); return values }
  catch (error) {
    // No arbitrary exception messages/stack, fixture bytes, IDs or keys in report.
    const errorName = error instanceof DOMException ? error.name : 'ProbeError'
    report.results.push({ code, status: 'fail', values: { errorName } }); render()
    throw new Error(code)
  }
}

export async function runSynthetic() {
  if (busy) throw new Error('probe.busy')
  busy = true
  try {
    await perform('wasm-csp', async () => { if (!await wasmProbe()) throw new Error('wasm.blocked'); return { compileAllowed: true } })
    await perform('sodium-worker', workerProbe)
    await perform('idb-commit', saveSynthetic)
    await perform('idb-readback', verifySynthetic)
    await perform('idb-abort', abortSynthetic)
    await perform('upload-key-store', saveUploadKey)
    await perform('upload-key-readback', verifyUploadKey)
    await perform('synthetic-canvas', syntheticCanvas)
    status.textContent = 'Синтетические пробы прошли. Reload/restart и device tests проверяются отдельно.'
    return structuredClone(report)
  } finally { busy = false }
}

export async function readback() {
  await perform('idb-after-reopen', verifySynthetic)
  await perform('upload-key-after-reopen', verifyUploadKey)
  status.textContent = 'Blob/job и upload-auth key восстановлены и проверены.'
  return structuredClone(report)
}

function action(id: string, operation: () => Promise<unknown>) {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement
    button.disabled = true
    try { await operation() }
    catch { status.textContent = 'Проверка не завершена. Смотрите безопасный код ошибки в отчёте; успех не подтверждён.' }
    finally { if (id !== 'stop-camera') button.disabled = false }
  })
}
action('run', runSynthetic)
action('readback', readback)
action('persist', async () => {
  await perform('storage-persist', async () => ({ supported: Boolean(navigator.storage?.persist), granted: navigator.storage?.persist ? await navigator.storage.persist() : false }))
  status.textContent = 'Результат запроса persistence записан; это не гарантия от eviction.'
})
action('clear', async () => { if (busy) throw new Error('probe.busy'); await clearLab(); report.results = []; render(); status.textContent = 'Удалена только база этого стенда.' })
action('start-camera', async () => { await perform('camera-start', () => startCamera(video)); cameraButtons(true) })
action('canvas', () => perform('camera-canvas', () => canvasCapture(video)))
action('still', () => perform('camera-still', stillCapture))
action('stop-camera', async () => { stop(); status.textContent = 'Камера выключена.' })
action('download', async () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'photobunker-i02-browser-report.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

for (const name of ['visibilitychange', 'pagehide', 'pageshow', 'online', 'offline']) {
  addEventListener(name, () => {
    report.lifecycle.push({ event: `${name}:${document.visibilityState}`, elapsedMs: Math.round(performance.now()) })
    if (report.lifecycle.length > 40) report.lifecycle.shift()
    if (name === 'pagehide' || document.visibilityState === 'hidden') {
      stop()
      cancelWorker?.()
    }
    render()
  })
}

// Deliberately tiny test interface; lab contains no app credentials or content.
declare global { interface Window { pbLab: { runSynthetic: typeof runSynthetic; readback: typeof readback; wasmProbe: typeof wasmProbe; clearLab: typeof clearLab; report: typeof report } } }
window.pbLab = { runSynthetic, readback, wasmProbe, clearLab, report }
render()
