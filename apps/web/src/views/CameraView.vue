<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import PhotoThumbnail from '../components/PhotoThumbnail.vue'
import { t } from '../i18n'
import { p } from '../profiles/text'
import { activeProfile, profiles, refreshProfiles, selectProfile } from '../profiles/store'
import { aspectRatio, snapshot, type Location, type PhotoMetadata } from '../profiles/model'
import { applyProfile, ResolutionError } from '../profiles/image'
import { locationTracker } from '../profiles/location'
import { cameraController, captureDemo, drawDemo } from '../local/camera'
import { localPrototype, savePhoto, type Capture, type Photo } from '../local/photos'
import { readPhoto, updatePhoto } from '../server/photos'
import { accessLibraryId } from '../server/api'
import { libraryChanged, photos } from '../local/library'

const router = useRouter()
const video = ref<HTMLVideoElement>(); const demo = ref<HTMLCanvasElement>()
const mode = ref<'off' | 'live' | 'demo'>('off'); const starting = ref(false); const ready = ref(false)
const saving = ref(false); const taking = ref(false); const facing = ref<'environment' | 'user'>('environment')
const status = ref<Parameters<typeof t>[0]>(); const pending = ref<Capture>(); const pendingUrl = ref('')
const rawPending = ref<Capture>(); const sizeError = ref<ResolutionError>()
const category = ref(''); const shot = ref(''); const locationStatus = ref<'pending' | 'unavailable'>()
const lastPhoto = ref<Photo>()
const sourceRatio = ref(4 / 3)
let details: Parameters<typeof savePhoto>[1]
let controller: ReturnType<typeof cameraController> | undefined
let alive = true
const ratio = computed(() => activeProfile.value ? aspectRatio(activeProfile.value.rules) ?? sourceRatio.value : sourceRatio.value)
const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; busy: boolean; next?: { location?: Location } }>()
async function finishLocation(id: string, location?: Location) {
  const job = waiting.get(id)
  if (!job) return
  if (job.busy) { job.next = { location }; return }
  job.busy = true
  try {
    const current = (await readPhoto(id)).photo
    const previous = current.metadata?.location
    const score = (value: Location) => value.accuracy + Math.abs(value.measuredAt - current.createdAt) / 1000 * 3
    const use = location && Math.abs(location.measuredAt - current.createdAt) <= current.profile!.rules.locationWindow * 1000 && (!previous || score(location) < score(previous)) ? location : previous
    const complete = !location || !!use && use.accuracy <= current.profile!.rules.accuracy
    const metadata: PhotoMetadata = { ...current.metadata, location: use, locationStatus: complete ? use ? undefined : 'unavailable' : 'pending' }
    await updatePhoto(id, { title: current.title, note: current.note, favorite: current.favorite, metadata }, current.remoteRevision)
    if (complete) { clearTimeout(job.timer); waiting.delete(id) }
    libraryChanged()
  } catch { /* The photo stays saved; a later sample or timeout can retry. */ }
  finally { job.busy = false; if (job.next && waiting.has(id)) { const next = job.next; job.next = undefined; void finishLocation(id, next.location) } }
}
const geo = locationTracker((location, permanent) => {
  locationStatus.value = location ? undefined : permanent ? 'unavailable' : 'pending'
  if (location || permanent) for (const id of waiting.keys()) void finishLocation(id, location)
})
function stop() { controller?.stop(); geo.stop(); for (const id of waiting.keys()) void finishLocation(id); mode.value = 'off'; ready.value = false }
function startLocation() { if (activeProfile.value?.rules.location !== 'off') { locationStatus.value = 'pending'; geo.start() } else locationStatus.value = undefined }
function releasePending() { pending.value = rawPending.value = undefined; sizeError.value = undefined; details = undefined; if (pendingUrl.value) URL.revokeObjectURL(pendingUrl.value); pendingUrl.value = '' }
async function start() {
  if (starting.value || !localPrototype || !activeProfile.value) return
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) { status.value = 'cameraNeedsSecure'; return }
  starting.value = true; status.value = undefined; stop()
  const rules = activeProfile.value.rules
  try { await controller!.start(facing.value, rules.resolution === 'fixed' ? { width: rules.width, height: rules.height } : undefined); if (alive) { mode.value = 'live'; startLocation() } }
  catch (error) {
    if (alive && error instanceof DOMException) status.value = error.name === 'NotAllowedError' ? 'cameraDenied' : error.name === 'NotFoundError' ? 'cameraMissing' : 'cameraBusy'
    else if (alive) status.value = 'cameraBusy'
  } finally { starting.value = false }
}
async function showDemo() { if (!activeProfile.value) return; stop(); await nextTick(); drawDemo(demo.value!); mode.value = 'demo'; ready.value = true; status.value = undefined; startLocation() }
async function flip() { facing.value = facing.value === 'environment' ? 'user' : 'environment'; await start() }
function changedProfile(event: Event) { stop(); selectProfile((event.target as HTMLSelectElement).value); category.value = shot.value = ''; status.value = undefined }
async function persist() {
  if (!pending.value || saving.value) return
  saving.value = true; status.value = 'saving'
  try {
    const photo = await savePhoto(pending.value, details)
    lastPhoto.value = photo
    if (photo.profile?.rules.location !== 'off' && photo.metadata?.locationStatus === 'pending') {
      const remaining = Math.max(0, photo.createdAt + photo.profile!.rules.locationWindow * 1000 - Date.now())
      const timer = setTimeout(() => { void finishLocation(photo.id) }, remaining)
      waiting.set(photo.id, { timer, busy: false })
      const location = geo.at(photo.createdAt)
      if (location) void finishLocation(photo.id, location)
    }
    releasePending(); libraryChanged(); status.value = 'saved'
  } catch { status.value = 'saveFailed' }
  finally { saving.value = false }
}
async function process(allowSmaller = false) {
  if (!rawPending.value || !details) return
  try {
    pending.value = await applyProfile(rawPending.value, details.profile.rules, details.metadata, allowSmaller)
    if (!alive) return
    rawPending.value = undefined; sizeError.value = undefined; pendingUrl.value = URL.createObjectURL(pending.value.blob)
    await persist()
  } catch (error) { if (alive) { if (error instanceof ResolutionError) sizeError.value = error; else { status.value = 'captureFailed'; releasePending() } } }
}
async function useAvailable() { taking.value = true; try { await process(true) } finally { taking.value = false } }
async function capture() {
  if (!ready.value || taking.value || saving.value || pending.value || rawPending.value || !activeProfile.value) return
  taking.value = true; status.value = undefined
  const profile = snapshot(activeProfile.value); const createdAt = Date.now()
  const candidate = profile.rules.location === 'off' ? undefined : geo.at(createdAt)
  const location = candidate && Math.abs(candidate.measuredAt - createdAt) <= profile.rules.locationWindow * 1000 ? candidate : undefined
  const metadata: PhotoMetadata = {}
  if (profile.rules.keepDate) metadata.capturedAt = createdAt
  if (profile.rules.keepCamera) metadata.camera = mode.value === 'demo' ? 'PhotoBunker DEMO' : controller?.source() || 'Camera'
  if (profile.rules.location !== 'off') { if (location) metadata.location = location; metadata.locationStatus = location && location.accuracy <= profile.rules.accuracy ? undefined : locationStatus.value === 'unavailable' ? 'unavailable' : 'pending' }
  details = { profile, createdAt, metadata, category: category.value, shot: shot.value, libraryId: accessLibraryId.value }
  try { const result = mode.value === 'demo' ? await captureDemo(demo.value!) : await controller!.capture(); if (alive) { rawPending.value = result; await process() } }
  catch { if (alive) { releasePending(); status.value = 'captureFailed' } }
  finally { taking.value = false }
}
function discard() { releasePending(); status.value = undefined }
function pause() { if (document.hidden) { stop(); status.value = 'cameraPaused' } }
function pagehide() { stop() }
function beforeUnload(event: BeforeUnloadEvent) { if (pending.value || rawPending.value || saving.value) { event.preventDefault(); event.returnValue = '' } }
onMounted(async () => {
  controller = cameraController(video.value!)
  document.addEventListener('visibilitychange', pause); window.addEventListener('pagehide', pagehide); window.addEventListener('beforeunload', beforeUnload)
  await refreshProfiles()
  if (alive && !activeProfile.value) await router.replace('/profiles')
})
onBeforeRouteLeave(() => { if (saving.value || taking.value) return false; return !(pending.value || rawPending.value) || confirm(t('discardQuestion')) })
onBeforeUnmount(() => {
  alive = false; stop(); releasePending(); waiting.forEach(job => clearTimeout(job.timer))
  document.removeEventListener('visibilitychange', pause); window.removeEventListener('pagehide', pagehide); window.removeEventListener('beforeunload', beforeUnload)
})
</script>
<template>
  <section class="camera-screen profile-camera" aria-labelledby="camera-title">
    <div class="capture-profile-bar"><label>{{ p('profile') }}<select :aria-label="p('profile')" :value="activeProfile?.id" :disabled="saving || taking || !!pending || !!rawPending" @change="changedProfile"><option v-for="profile in profiles.filter(item => !item.archived)" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label><RouterLink :to="activeProfile ? `/profiles/${activeProfile.id}` : '/profiles'" class="quiet-button">{{ p('editAction') }}</RouterLink></div>
    <div v-if="activeProfile && (activeProfile.rules.categories.length || activeProfile.rules.shotList.length)" class="capture-context"><label v-if="activeProfile.rules.categories.length">{{ p('category') }}<select :aria-label="p('category')" v-model="category" :disabled="taking || saving || !!rawPending || !!pending"><option value="">{{ p('noCategory') }}</option><option v-for="item in activeProfile.rules.categories" :key="item">{{ item }}</option></select></label><label v-if="activeProfile.rules.shotList.length">{{ p('shot') }}<select :aria-label="p('shot')" v-model="shot" :disabled="taking || saving || !!rawPending || !!pending"><option value="">{{ p('noShot') }}</option><option v-for="item in activeProfile.rules.shotList" :key="item">{{ item }}</option></select></label></div>
    <div :class="['viewfinder', { 'viewfinder-live': mode !== 'off' }]" :style="{ '--capture-ratio': ratio, aspectRatio: ratio }">
      <video ref="video" v-show="mode === 'live'" class="camera-video" :class="{ mirrored: facing === 'user' }" :style="{ objectFit: activeProfile?.rules.fit === 'contain' ? 'contain' : 'cover' }" muted playsinline @loadeddata="ready = true; sourceRatio = video!.videoWidth / video!.videoHeight" aria-label="Camera preview" /><canvas ref="demo" v-show="mode === 'demo'" class="camera-video" :style="{ objectFit: activeProfile?.rules.fit === 'contain' ? 'contain' : 'cover' }" />
      <div class="viewfinder-top"><AppIcon name="device" /><span>{{ mode === 'demo' ? t('demoMode') : t('localOnly') }}</span></div><button v-if="mode !== 'off'" class="camera-stop" :aria-label="t('stopCamera')" @click="stop"><AppIcon name="close" /></button>
      <div v-if="mode === 'off'" class="camera-message"><span class="camera-emblem"><AppIcon name="camera" /></span><p class="eyebrow">{{ activeProfile?.name }}</p><h1 id="camera-title">{{ t('cameraTitle') }}</h1><p class="supporting-copy">{{ localPrototype ? t('cameraDescription') : t('prototypeDisabled') }}</p><div v-if="localPrototype" class="camera-start-actions"><button class="primary-button" :disabled="starting || saving || taking" @click="start">{{ t(starting ? 'cameraStarting' : 'enableCamera') }}</button><button class="quiet-button" :disabled="starting || saving || taking" @click="showDemo">{{ t('tryDemo') }}</button></div></div><h1 v-else id="camera-title" class="sr-only">{{ t('camera') }}</h1>
      <div v-if="pendingUrl" class="pending-capture"><img :src="pendingUrl" alt=""><span>{{ t(saving ? 'saving' : 'saveFailed') }}</span></div>
    </div>
    <div class="camera-controls"><p class="photo-mode">{{ activeProfile?.rules.resolution === 'fixed' ? `${activeProfile.rules.width} × ${activeProfile.rules.height}` : p('maximum') }} · {{ activeProfile?.rules.aspect === 'native' ? p('native') : activeProfile?.rules.aspect }}</p>
      <div class="capture-controls"><RouterLink :to="`/gallery?profile=${activeProfile?.id ?? ''}`" class="archive-button" :aria-label="t('gallery')"><PhotoThumbnail v-if="photos.find(photo => photo.profile?.id === activeProfile?.id)" :id="photos.find(photo => photo.profile?.id === activeProfile?.id)!.id" /><AppIcon v-else name="gallery" /></RouterLink><button type="button" class="shutter" :disabled="!localPrototype || !activeProfile || mode === 'off' || !ready || starting || taking || saving || !!pending || !!rawPending" :aria-label="t('capture')" :aria-busy="saving || taking" @click="capture"><span /></button><button class="flip-button" :disabled="mode !== 'live' || starting || taking || saving" :aria-label="t('cameraFlip')" @click="flip"><AppIcon name="flip" /></button></div>
      <div v-if="sizeError" class="resolution-warning" role="alert"><strong>{{ p('resolutionLimited') }}: {{ sizeError.width }} × {{ sizeError.height }}</strong><p>{{ p('resolutionHint') }}</p><button class="primary-button" :disabled="taking" @click="useAvailable">{{ p('useAvailable') }}</button><button class="quiet-button" @click="discard">{{ t('discard') }}</button></div>
      <p v-if="status" class="capture-feedback" role="status">{{ t(status) }}<template v-if="status === 'saved' && lastPhoto"> · {{ lastPhoto.shortId }} · {{ lastPhoto.width }} × {{ lastPhoto.height }}</template></p><p v-else class="capture-note">{{ t(localPrototype ? 'captureNote' : 'prototypeDisabled') }}</p><p v-if="mode !== 'off' && activeProfile?.rules.location !== 'off'" class="capture-note">{{ locationStatus ? p(locationStatus === 'pending' ? 'locationPending' : 'locationUnavailable') : p('location') }}</p>
      <div v-if="pending && !saving" class="inline-actions"><button class="primary-button" @click="persist">{{ t('retry') }}</button><button class="quiet-button" @click="discard">{{ t('discard') }}</button></div>
    </div>
  </section>
</template>
