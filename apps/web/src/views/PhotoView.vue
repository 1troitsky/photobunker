<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { locale, t } from '../i18n'
import { deletePhoto, readPhoto, updatePhoto } from '../local/photos'
import type { Photo } from '../local/photos'
import { formatBytes, libraryChanged } from '../local/library'

const route = useRoute()
const router = useRouter()
const photo = ref<Photo>()
const original = ref<Blob>()
const url = ref('')
const title = ref('')
const note = ref('')
const loading = ref(true)
const busy = ref(false)
const deleted = ref(false)
const status = ref<Parameters<typeof t>[0]>()
const dirty = computed(() => !!photo.value && (title.value !== photo.value.title || note.value !== photo.value.note))
let generation = 0
function release() { if (url.value) URL.revokeObjectURL(url.value); url.value = ''; original.value = undefined }
watch(() => route.params.id, async id => {
  const current = ++generation
  release(); photo.value = undefined; loading.value = true; status.value = undefined
  try {
    const result = await readPhoto(String(id))
    if (current !== generation) return
    photo.value = result.photo; original.value = result.blob; url.value = URL.createObjectURL(result.blob)
    title.value = result.photo.title; note.value = result.photo.note
  } catch { /* Missing/evicted/denied data must not be shown as an empty photo. */ }
  finally { if (current === generation) loading.value = false }
}, { immediate: true })

async function save() {
  if (!photo.value || busy.value) return
  busy.value = true; status.value = undefined
  try { photo.value = await updatePhoto(photo.value.id, { title: title.value, note: note.value, favorite: photo.value.favorite }); title.value = photo.value.title; note.value = photo.value.note; libraryChanged(); status.value = 'changesSaved' }
  catch { status.value = 'changeFailed' }
  finally { busy.value = false }
}
async function favorite() {
  if (!photo.value || busy.value) return
  busy.value = true; status.value = undefined
  try { photo.value = await updatePhoto(photo.value.id, { title: photo.value.title, note: photo.value.note, favorite: !photo.value.favorite }); libraryChanged() }
  catch { status.value = 'changeFailed' }
  finally { busy.value = false }
}
async function remove() {
  if (!photo.value || busy.value || !window.confirm(t('deleteQuestion'))) return
  busy.value = true; status.value = undefined
  try { await deletePhoto(photo.value.id); deleted.value = true; libraryChanged(); await router.replace('/gallery') }
  catch { status.value = 'deleteFailed' }
  finally { busy.value = false }
}
function download() {
  if (!original.value || !photo.value) return
  const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/avif': 'avif' } as Record<string, string>)[original.value.type] ?? 'img'
  const downloadUrl = URL.createObjectURL(original.value)
  const link = document.createElement('a'); link.href = downloadUrl; link.download = `photobunker-${photo.value.id}.${extension}`; link.click()
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
    <RouterLink to="/gallery" class="back-link"><AppIcon name="back" />{{ t('backToGallery') }}</RouterLink>
    <p v-if="loading" class="loading-state" role="status">{{ t('loading') }}</p>
    <div v-else-if="!photo" class="empty-gallery"><h1>{{ t('photoUnavailable') }}</h1><p class="supporting-copy">{{ t('photoUnavailableHint') }}</p></div>
    <template v-else>
      <header class="photo-heading"><div><p class="eyebrow">{{ t('localOnly') }}</p><h1>{{ photo.title || (photo.method === 'demo' ? t('testPhoto') : t('photoTitlePlaceholder')) }}</h1></div><button class="icon-button favorite-button" :class="{ selected: photo.favorite }" :disabled="busy" :aria-label="t(photo.favorite ? 'removeFavorite' : 'addFavorite')" :aria-pressed="photo.favorite" @click="favorite"><AppIcon name="star" /></button></header>
      <div class="photo-layout">
        <div class="original-preview"><img :src="url" :alt="photo.title || t('photo')" decoding="async"></div>
        <aside class="photo-details">
          <form class="photo-form" @submit.prevent="save">
            <label for="photo-title">{{ t('photoTitle') }}</label><input id="photo-title" v-model="title" :disabled="busy" maxlength="120" :placeholder="t('photoTitlePlaceholder')">
            <label for="photo-note">{{ t('photoNote') }}</label><textarea id="photo-note" v-model="note" :disabled="busy" maxlength="2000" rows="5" :placeholder="t('photoNotePlaceholder')" />
            <button class="primary-button" :disabled="busy || !dirty" type="submit">{{ t('saveChanges') }}</button>
          </form>
          <p v-if="status" class="capture-feedback" role="status">{{ t(status) }}</p>
          <dl class="photo-facts"><div><dt>{{ t('resolution') }}</dt><dd>{{ photo.width }} × {{ photo.height }}</dd></div><div><dt>{{ t('fileSize') }}</dt><dd>{{ formatBytes(photo.bytes) }}</dd></div><div><dt>{{ t('capturedAt') }}</dt><dd>{{ new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(photo.createdAt) }}</dd></div><div><dt>{{ t('cameraSource') }}</dt><dd>{{ t(photo.method === 'demo' ? 'testPhoto' : photo.method === 'image-capture' ? 'nativePhoto' : 'videoPhoto') }}</dd></div></dl>
          <button class="secondary-button" :disabled="busy" @click="download"><AppIcon name="download" />{{ t('download') }}</button>
          <button class="danger-button" :disabled="busy" @click="remove"><AppIcon name="trash" />{{ t('deletePhoto') }}</button>
        </aside>
      </div>
    </template>
  </section>
</template>
