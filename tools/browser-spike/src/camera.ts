let stream: MediaStream | undefined
let generation = 0

export function stopCamera(video: HTMLVideoElement) {
  generation++
  stream?.getTracks().forEach(track => track.stop())
  stream = undefined
  video.srcObject = null
}

export async function startCamera(video: HTMLVideoElement) {
  stopCamera(video)
  const current = generation
  const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } } })
  if (current !== generation) {
    acquired.getTracks().forEach(track => track.stop())
    throw new Error('camera.cancelled')
  }
  stream = acquired
  video.srcObject = acquired
  try {
    await video.play()
    if (current !== generation) throw new Error('camera.cancelled')
  } catch (error) {
    acquired.getTracks().forEach(track => track.stop())
    if (stream === acquired) stream = undefined
    if (video.srcObject === acquired) video.srcObject = null
    throw error
  }
  const settings = acquired.getVideoTracks()[0].getSettings()
  // Device IDs/labels and media bytes never enter the report.
  return { width: settings.width, height: settings.height, facingMode: settings.facingMode ?? 'unreported' }
}

async function dimensions(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    try { return { width: bitmap.width, height: bitmap.height } }
    finally { bitmap.close() }
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally { URL.revokeObjectURL(url) }
}

function encode(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas.encode_failed')), 'image/jpeg', 0.95))
}

export async function canvasCapture(video: HTMLVideoElement) {
  if (!stream || video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('camera.not_ready')
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas.unavailable')
  try {
    ctx.drawImage(video, 0, 0)
    const blob = await encode(canvas)
    return { method: 'video-canvas', ...await dimensions(blob), bytes: blob.size, mime: blob.type, orientation: screen.orientation?.type ?? 'unreported' }
  } finally { canvas.width = canvas.height = 0 }
}

type StillCapture = { takePhoto: () => Promise<Blob> }
type ImageCaptureConstructor = new (track: MediaStreamTrack) => StillCapture
export async function stillCapture() {
  const Constructor = (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture
  if (!stream || !Constructor) throw new Error('image_capture.unsupported')
  const capture = new Constructor(stream.getVideoTracks()[0])
  if (typeof capture.takePhoto !== 'function') throw new Error('image_capture.unsupported')
  const blob = await capture.takePhoto()
  return { method: 'image-capture', ...await dimensions(blob), bytes: blob.size, mime: blob.type, orientation: screen.orientation?.type ?? 'unreported' }
}

export async function syntheticCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 800
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas.unavailable')
  try {
    ctx.fillStyle = '#254631'; ctx.fillRect(0, 0, 1200, 800)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 100)
    ctx.fillStyle = '#000'; ctx.font = '36px sans-serif'; ctx.fillText('TOP LEFT', 10, 65)
    const blob = await encode(canvas)
    const decoded = await dimensions(blob)
    if (decoded.width !== 1200 || decoded.height !== 800) throw new Error('canvas.dimension_mismatch')
    return { ...decoded, bytes: blob.size, realCameraOrientation: 'pending' }
  } finally { canvas.width = canvas.height = 0 }
}
