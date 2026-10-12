import type { Capture } from './photos'

function encode(canvas: HTMLCanvasElement, quality = 0.94): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('capture.encode')), 'image/jpeg', quality))
}

async function prepare(blob: Blob, method: Capture['method']): Promise<Capture> {
  const url = URL.createObjectURL(blob)
  const image = new Image()
  try {
    image.src = url
    await image.decode()
    const thumbnail = document.createElement('canvas')
    const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight))
    thumbnail.width = Math.max(1, Math.round(image.naturalWidth * scale))
    thumbnail.height = Math.max(1, Math.round(image.naturalHeight * scale))
    try {
      const context = thumbnail.getContext('2d')
      if (!context) throw new Error('capture.canvas')
      context.drawImage(image, 0, 0, thumbnail.width, thumbnail.height)
      return { blob, thumbnail: await encode(thumbnail, 0.8), width: image.naturalWidth, height: image.naturalHeight, method }
    } finally { thumbnail.width = thumbnail.height = 0 }
  } finally { image.src = ''; URL.revokeObjectURL(url) }
}

export function cameraController(video: HTMLVideoElement) {
  let stream: MediaStream | undefined
  let generation = 0
  function stop() { generation++; stream?.getTracks().forEach(track => track.stop()); stream = undefined; video.srcObject = null }
  async function start(facingMode: 'environment' | 'user') {
    stop()
    const current = generation
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facingMode }, width: { ideal: 4096 }, height: { ideal: 3072 } } })
    if (generation !== current) { acquired.getTracks().forEach(track => track.stop()); throw new Error('capture.cancelled') }
    stream = acquired
    video.srcObject = stream
    try { await video.play(); if (generation !== current) throw new Error('capture.cancelled') }
    catch (error) { acquired.getTracks().forEach(track => track.stop()); if (stream === acquired) { stream = undefined; video.srcObject = null }; throw error }
  }
  async function capture(): Promise<Capture> {
    const current = generation
    if (!stream || video.readyState < 2) throw new Error('capture.not_ready')
    const track = stream.getVideoTracks()[0]!
    type Still = new (track: MediaStreamTrack) => { takePhoto?: () => Promise<Blob> }
    const ImageCaptureAPI = (window as unknown as { ImageCapture?: Still }).ImageCapture
    let photo: Capture | undefined
    if (ImageCaptureAPI) {
      const still = new ImageCaptureAPI(track)
      if (still.takePhoto) {
        try { photo = await prepare(await still.takePhoto(), 'image-capture') }
        catch (error) { if (!(error instanceof DOMException && error.name === 'NotSupportedError')) throw error }
      }
    }
    if (!photo) {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      try {
        const context = canvas.getContext('2d')
        if (!context || !canvas.width || !canvas.height) throw new Error('capture.not_ready')
        context.drawImage(video, 0, 0)
        photo = await prepare(await encode(canvas), 'video-frame')
      } finally { canvas.width = canvas.height = 0 }
    }
    if (generation !== current) throw new Error('capture.cancelled')
    return photo
  }
  return { start, stop, capture }
}

// An explicitly labelled, generated test scene. No camera or downloaded media.
export function drawDemo(canvas: HTMLCanvasElement) {
  canvas.width = 1600; canvas.height = 1200
  const ctx = canvas.getContext('2d')!
  const sky = ctx.createLinearGradient(0, 0, 0, 1200)
  sky.addColorStop(0, '#c6dac0'); sky.addColorStop(0.65, '#739384'); sky.addColorStop(1, '#253f35')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1600, 1200)
  ctx.fillStyle = '#eff0c9'; ctx.beginPath(); ctx.arc(1130, 300, 110, 0, Math.PI * 2); ctx.fill()
  for (const [color, top, offset] of [['#6c8d78', 650, 0], ['#3a6050', 830, 200], ['#203f34', 1040, -100]] as const) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, top)
    ctx.bezierCurveTo(400, top - 310 + offset, 900, top + 270, 1600, top - 150)
    ctx.lineTo(1600, 1200); ctx.lineTo(0, 1200); ctx.fill()
  }
  ctx.fillStyle = '#f0f3e6'; ctx.font = '500 36px sans-serif'; ctx.fillText('PhotoBunker / DEMO', 85, 1085)
}
export async function captureDemo(canvas: HTMLCanvasElement) { return prepare(await encode(canvas), 'demo') }
