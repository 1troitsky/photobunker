<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { locale, t } from '../i18n'
import { deletePhoto, readPhoto, saveOnServer, updatePhoto } from '../server/photos'
import { belongsToServer, ServerError } from '../server/api'
import type { Photo } from '../local/photos'
import { formatBytes, libraryChanged } from '../local/library'
import { missingRequirements } from '../profiles/model'
import { p, type ProfileText } from '../profiles/text'

const route = useRoute()
const router = useRouter()
const photo = ref<Photo>()
const original = ref<Blob>()
const url = ref('')
const title = ref('')
const note = ref('')
const category = ref('')
const loading = ref(true)
const busy = ref(false)
const deleted = ref(false)
const status = ref<Parameters<typeof t>[0]>()
const dirty = computed(() => !!photo.value && (title.value !== photo.value.title || note.value !== photo.value.note || category.value !== (photo.value.category ?? '')))
const missing = computed(() => photo.value ? missingRequirements(photo.value) : [])
const requirementLabels: Record<string, ProfileText> = { description: 'missingDescription', category: 'missingCategory', location: 'missingLocation', resolution: 'missingResolution' }
function locked(field: 'title' | 'note' | 'category') { return !!photo.value?.profile && !photo.value.profile.rules.descriptionEditable && !!photo.value[field] }
const onServer = computed(() => !!photo.value && belongsToServer(photo.value) && photo.value.remoteRevision !== undefined)
const metadataBusy = computed(() => busy.value || !!photo.value?.uploadRequested && !onServer.value)
let generation = 0
function release() { if (url.value) URL.revokeObjectURL(url.value); url.value = ''; original.value = undefined }
watch(() => route.params.id, async id => {
  const current = ++generation
  release(); photo.value = undefined; loading.value = true; status.value = undefined
  try {
    const result = await readPhoto(String(id))
    if (current !== generation) return
    photo.value = result.photo; original.value = result.blob; url.value = URL.createObjectURL(result.blob)
    title.value = result.photo.title; note.value = result.photo.note; category.value = result.photo.category ?? ''
  } catch { /* Missing/evicted/denied data must not be shown as an empty photo. */ }
  finally { if (current === generation) loading.value = false }
}, { immediate: true })

async function save() {
  if (!photo.value || busy.value) return
  busy.value = true; status.value = undefined
  try { photo.value = await updatePhoto(photo.value.id, { title: title.value, note: note.value, category: category.value, favorite: photo.value.favorite }, photo.value.remoteRevision); title.value = photo.value.title; note.value = photo.value.note; category.value = photo.value.category ?? ''; libraryChanged(); status.value = 'changesSaved' }
  catch (error) { status.value = error instanceof ServerError && error.status === 409 ? 'changeConflict' : 'changeFailed' }
  finally { busy.value = false }
}
async function favorite() {
  if (!photo.value || busy.value) return
  busy.value = true; status.value = undefined
  try { photo.value = await updatePhoto(photo.value.id, { title: photo.value.title, note: photo.value.note, favorite: !photo.value.favorite }, photo.value.remoteRevision); libraryChanged() }
  catch (error) { status.value = error instanceof ServerError && error.status === 409 ? 'changeConflict' : 'changeFailed' }
  finally { busy.value = false }
}
async function remove() {
  if (!photo.value || busy.value || !window.confirm(t(onServer.value || photo.value.uploadRequested ? 'serverDeleteQuestion' : 'deleteQuestion'))) return
  busy.value = true; status.value = undefined
  try { await deletePhoto(photo.value.id); deleted.value = true; libraryChanged(); await router.replace('/gallery') }
  catch { status.value = 'deleteFailed' }
  finally { busy.value = false }
}
async function upload() {
  if (!photo.value || busy.value || dirty.value) return
  busy.value = true; status.value = 'serverUploading'
  try { photo.value = await saveOnServer(photo.value.id); libraryChanged(); status.value = 'serverSaved' }
  catch { photo.value.uploadRequested = true; libraryChanged(); status.value = 'serverUploadFailed' }
  finally { busy.value = false }
}
function download() {
  if (!original.value || !photo.value) return
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/avif': 'avif' } as Record<string, string>)[original.value.type] ?? 'img'
  const downloadUrl = URL.createObjectURL(original.value)
  const link = document.createElement('a'); link.href = downloadUrl; link.download = `photobunker-${photo.value.shortId ?? photo.value.id}.${extension}`; link.click()
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 10_000)
}
function canLeave() { return deleted.value || !busy.value && (!dirty.value || window.confirm(locale.value === 'ru' ? 'Изменения не сохранены. Уйти без сохранения?' : 'Changes are not saved. Leave without saving?')) }
onBeforeRouteLeave(canLeave)
onBeforeRouteUpdate(canLeave)
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || busy.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => { generation++; release(); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <section class="content-screen photo-screen">
    <RouterLink :to="photo?.profile ? `/gallery?profile=${photo.profile.id}` : '/gallery'" class="back-link"><AppIcon name="back" />{{ t('backToGallery') }}</RouterLink>
    <p v-if="loading" class="loading-state" role="status">{{ t('loading') }}</p>
    <div v-else-if="!photo" class="empty-gallery"><h1>{{ t('photoUnavailable') }}</h1><p class="supporting-copy">{{ t('photoUnavailableHint') }}</p></div>
    <template v-else>
      <header class="photo-heading"><div><p class="eyebrow">{{ t(onServer ? 'serverSaved' : 'browserOnly') }}</p><h1>{{ photo.title || (photo.method === 'demo' ? t('testPhoto') : t('photoTitlePlaceholder')) }}</h1></div><button class="icon-button favorite-button" :class="{ selected: photo.favorite }" :disabled="metadataBusy" :aria-label="t(photo.favorite ? 'removeFavorite' : 'addFavorite')" :aria-pressed="photo.favorite" @click="favorite"><AppIcon name="star" /></button></header>
      <div class="photo-layout">
        <div class="original-preview"><img :src="url" :alt="photo.title || t('photo')" decoding="async"></div>
        <aside class="photo-details">
          <div v-if="photo.profile" class="photo-profile-info"><strong>{{ photo.profile.name }}</strong> · {{ p('version') }} {{ photo.profile.version }}<small>{{ p('profileSnapshot') }}</small><p v-if="photo.shortId" class="photo-short-id">{{ photo.shortId }}</p><p>{{ p(photo.profile.rules.metadata === 'none' ? 'noMetadata' : photo.profile.rules.metadata) }}</p><p v-if="photo.shot">{{ p('shot') }}: {{ photo.shot }}</p></div>
          <p v-if="photo.profile" class="requirements-status" :class="{ incomplete: missing.length }">{{ p(missing.length ? 'incomplete' : 'complete') }}<template v-if="missing.length">: {{ missing.map(item => p(requirementLabels[item]!)).join(', ') }}</template></p>
          <div class="server-delivery"><p>{{ t(onServer ? 'serverSaved' : photo.uploadRequested ? 'serverPending' : 'browserOnly') }}</p><button v-if="!onServer" class="primary-button" :disabled="busy || dirty" @click="upload">{{ t(photo.uploadRequested ? 'retryUpload' : 'saveOnServer') }}</button><small v-if="dirty && !onServer">{{ t('saveBeforeUpload') }}</small></div>
          <form class="photo-form" @submit.prevent="save">
            <label for="photo-title">{{ t('photoTitle') }}</label><input id="photo-title" v-model="title" :disabled="metadataBusy || locked('title')" maxlength="120" :placeholder="t('photoTitlePlaceholder')">
            <label for="photo-note">{{ t('photoNote') }}</label><textarea id="photo-note" v-model="note" :disabled="metadataBusy || locked('note')" maxlength="2000" rows="5" :placeholder="t('photoNotePlaceholder')" />
            <template v-if="photo.profile?.rules.categories.length"><label for="photo-category">{{ p('category') }}</label><select id="photo-category" v-model="category" :disabled="metadataBusy || locked('category')"><option value="">{{ p('noCategory') }}</option><option v-for="item in photo.profile.rules.categories" :key="item">{{ item }}</option></select></template>
            <p v-if="photo.profile && !photo.profile.rules.descriptionEditable" class="field-hint">{{ p('locked') }}</p>
            <button class="primary-button" :disabled="metadataBusy || !dirty" type="submit">{{ t('saveChanges') }}</button>
          </form>
          <p v-if="status" class="capture-feedback" role="status">{{ t(status) }}</p>
          <dl class="photo-facts"><div><dt>{{ t('resolution') }}</dt><dd>{{ photo.width }} × {{ photo.height }}</dd></div><div><dt>{{ t('fileSize') }}</dt><dd>{{ formatBytes(photo.bytes) }}</dd></div><div v-if="!photo.profile || photo.metadata?.capturedAt"><dt>{{ t('capturedAt') }}</dt><dd>{{ new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(photo.metadata?.capturedAt ?? photo.createdAt) }}</dd></div><div v-if="!photo.profile || photo.metadata?.camera"><dt>{{ t('cameraSource') }}</dt><dd>{{ photo.metadata?.camera || t(photo.method === 'demo' ? 'testPhoto' : photo.method === 'image-capture' ? 'nativePhoto' : 'videoPhoto') }}</dd></div><template v-if="photo.metadata?.location"><div><dt>{{ p('location') }}</dt><dd>{{ photo.metadata.location.latitude.toFixed(5) }}, {{ photo.metadata.location.longitude.toFixed(5) }}</dd></div><div><dt>{{ p('locationApproximate') }}</dt><dd>± {{ Math.round(photo.metadata.location.accuracy) }} m</dd></div><div><dt>{{ p('locationOffset') }}</dt><dd>{{ ((photo.metadata.location.measuredAt - photo.createdAt) / 1000).toFixed(1) }}</dd></div></template></dl>
          <p v-if="photo.metadata?.locationStatus" class="field-hint">{{ p(photo.metadata.locationStatus === 'pending' ? 'locationPending' : 'locationUnavailable') }}</p>
          <button class="secondary-button" :disabled="busy" @click="download"><AppIcon name="download" />{{ t('download') }}</button>
          <button class="danger-button" :disabled="busy" @click="remove"><AppIcon name="trash" />{{ t('deletePhoto') }}</button>
        </aside>
      </div>
    </template>
  </section>
</template>
