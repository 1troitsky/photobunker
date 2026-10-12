<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import PhotoThumbnail from '../components/PhotoThumbnail.vue'
import { t } from '../i18n'
import { cameraController, captureDemo, drawDemo } from '../local/camera'
import { localPrototype, savePhoto } from '../local/photos'
import type { Capture } from '../local/photos'
import { libraryChanged, photos } from '../local/library'

const video = ref<HTMLVideoElement>()
const demo = ref<HTMLCanvasElement>()
const mode = ref<'off' | 'live' | 'demo'>('off')
const starting = ref(false)
const ready = ref(false)
const saving = ref(false)
const taking = ref(false)
const facing = ref<'environment' | 'user'>('environment')
const status = ref<Parameters<typeof t>[0]>()
const pending = ref<Capture>()
const pendingUrl = ref('')
let controller: ReturnType<typeof cameraController> | undefined
let alive = true

function stop() { controller?.stop(); mode.value = 'off'; ready.value = false }
function releasePending() { pending.value = undefined; if (pendingUrl.value) URL.revokeObjectURL(pendingUrl.value); pendingUrl.value = '' }
async function start() {
  if (starting.value || !localPrototype) return
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) { status.value = 'cameraNeedsSecure'; return }
  starting.value = true; status.value = undefined; stop()
  try { await controller!.start(facing.value); if (alive) mode.value = 'live' }
  catch (error) {
    if (alive && error instanceof DOMException) status.value = error.name === 'NotAllowedError' ? 'cameraDenied' : error.name === 'NotFoundError' ? 'cameraMissing' : 'cameraBusy'
    else if (alive) status.value = 'cameraBusy'
  } finally { starting.value = false }
}
async function showDemo() { stop(); await nextTick(); drawDemo(demo.value!); mode.value = 'demo'; ready.value = true; status.value = undefined }
async function flip() { facing.value = facing.value === 'environment' ? 'user' : 'environment'; await start() }
async function persist() {
  if (!pending.value || saving.value) return
  saving.value = true; status.value = 'saving'
  try { await savePhoto(pending.value); releasePending(); libraryChanged(); status.value = 'saved' }
  catch { status.value = 'saveFailed' }
  finally { saving.value = false }
}
async function capture() {
  if (!ready.value || taking.value || saving.value || pending.value) return
  taking.value = true; status.value = undefined
  try {
    const result = mode.value === 'demo' ? await captureDemo(demo.value!) : await controller!.capture()
    if (!alive) return
    pending.value = result; pendingUrl.value = URL.createObjectURL(result.blob)
    await persist()
  } catch { if (alive) status.value = 'captureFailed' }
  finally { taking.value = false }
}
function discard() { releasePending(); status.value = undefined }
function pause() { if (document.hidden) { stop(); status.value = 'cameraPaused' } }
function pagehide() { stop() }
function beforeUnload(event: BeforeUnloadEvent) { if (pending.value || saving.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(() => {
  controller = cameraController(video.value!)
  document.addEventListener('visibilitychange', pause)
  window.addEventListener('pagehide', pagehide)
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeRouteLeave(() => {
  if (saving.value || taking.value) return false
  if (pending.value && !window.confirm(t('discardQuestion'))) return false
  return true
})
onBeforeUnmount(() => {
  alive = false; stop(); releasePending()
  document.removeEventListener('visibilitychange', pause)
  window.removeEventListener('pagehide', pagehide)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <section class="camera-screen" aria-labelledby="camera-title">
    <div :class="['viewfinder', { 'viewfinder-live': mode !== 'off' }]">
      <video ref="video" v-show="mode === 'live'" class="camera-video" :class="{ mirrored: facing === 'user' }" muted playsinline @loadeddata="ready = true" aria-label="Camera preview" />
      <canvas ref="demo" v-show="mode === 'demo'" class="camera-video" />
      <div class="viewfinder-top"><AppIcon name="device" /><span>{{ mode === 'demo' ? t('demoMode') : t('localOnly') }}</span></div>
      <button v-if="mode !== 'off'" class="camera-stop" :aria-label="t('stopCamera')" @click="stop"><AppIcon name="close" /></button>
      <span class="frame-corner top-left" /><span class="frame-corner top-right" /><span class="frame-corner bottom-left" /><span class="frame-corner bottom-right" />
      <div v-if="mode === 'off'" class="camera-message">
        <span class="camera-emblem"><AppIcon name="camera" /></span>
        <p class="eyebrow">{{ t('cameraEyebrow') }}</p><h1 id="camera-title">{{ t('cameraTitle') }}</h1>
        <p class="supporting-copy">{{ localPrototype ? t('cameraDescription') : t('prototypeDisabled') }}</p>
        <div v-if="localPrototype" class="camera-start-actions">
          <button class="primary-button" :disabled="starting || saving || taking" @click="start">{{ starting ? t('cameraStarting') : t('enableCamera') }}</button>
          <button class="quiet-button" :disabled="starting || saving || taking" @click="showDemo">{{ t('tryDemo') }}</button>
        </div>
      </div>
      <h1 v-else id="camera-title" class="sr-only">{{ t('camera') }}</h1>
      <div v-if="pendingUrl" class="pending-capture"><img :src="pendingUrl" alt=""><span>{{ t(saving ? 'saving' : 'saveFailed') }}</span></div>
    </div>
    <div class="camera-controls">
      <p class="photo-mode">{{ mode === 'demo' ? t('demoMode') : t('photoMode') }}</p>
      <div class="capture-controls">
        <RouterLink to="/gallery" class="archive-button" :aria-label="t('gallery')"><PhotoThumbnail v-if="photos[0]" :id="photos[0].id" /><AppIcon v-else name="gallery" /></RouterLink>
        <button type="button" class="shutter" :disabled="!localPrototype || mode === 'off' || !ready || starting || taking || saving || !!pending" :aria-label="t('capture')" :aria-busy="saving || taking" @click="capture"><span /></button>
        <button type="button" class="flip-button" :disabled="mode !== 'live' || starting || taking || saving" :aria-label="t('cameraFlip')" @click="flip"><AppIcon name="flip" /></button>
      </div>
      <p v-if="status" :class="['capture-feedback', { 'feedback-error': status === 'saveFailed' || status.startsWith('camera') && status !== 'cameraPaused' || status === 'captureFailed' }]" role="status">{{ t(status) }}</p>
      <p v-else class="capture-note">{{ t(localPrototype ? 'captureNote' : 'prototypeDisabled') }}</p>
      <div v-if="pending && !saving" class="inline-actions"><button class="primary-button" @click="persist">{{ t('retry') }}</button><button class="quiet-button" @click="discard">{{ t('discard') }}</button></div>
    </div>
  </section>
</template>
