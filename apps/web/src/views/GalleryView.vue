<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PhotoThumbnail from '../components/PhotoThumbnail.vue'
import { locale, t } from '../i18n'
import { libraryError, libraryLoading, photos, refreshLibrary } from '../local/library'
const search = ref('')
const favorites = ref(false)
const visible = computed(() => photos.value.filter(photo => (!favorites.value || photo.favorite) && `${photo.title} ${photo.note} ${photo.method === 'demo' ? t('testPhoto') : t('photo')}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
const day = (time: number) => new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'long', year: 'numeric' }).format(time)
const groups = computed(() => {
  const result: { day: string; photos: typeof photos.value }[] = []
  for (const photo of visible.value) { const label = day(photo.createdAt); const last = result.at(-1); if (last?.day === label) last.photos.push(photo); else result.push({ day: label, photos: [photo] }) }
  return result
})
onMounted(refreshLibrary)
</script>

<template>
  <section class="content-screen gallery-screen" aria-labelledby="gallery-title">
    <header class="page-heading gallery-heading"><div><p class="eyebrow">{{ t('galleryEyebrow') }}</p><h1 id="gallery-title">{{ t('gallery') }}<span v-if="photos.length" class="photo-count">{{ photos.length }}</span></h1><p>{{ t('localOnly') }}</p></div><RouterLink to="/" class="primary-button"><AppIcon name="camera" />{{ t('capture') }}</RouterLink></header>
    <div v-if="photos.length" class="gallery-toolbar">
      <div class="segmented-control"><button :aria-pressed="!favorites" @click="favorites = false">{{ t('allPhotos') }}</button><button :aria-pressed="favorites" @click="favorites = true"><AppIcon name="star" />{{ t('favorites') }}</button></div>
      <input v-model="search" type="search" :placeholder="t('searchPhotos')" :aria-label="t('searchPhotos')">
    </div>
    <div v-if="libraryError" class="empty-gallery"><AppIcon name="offline" /><h2>{{ t('storageFailed') }}</h2><button class="text-button" @click="refreshLibrary">{{ t('retry') }}</button></div>
    <p v-else-if="libraryLoading && !photos.length" class="loading-state" role="status">{{ t('loading') }}</p>
    <template v-else-if="visible.length">
      <section v-for="group in groups" :key="group.day" class="gallery-group"><h2>{{ group.day }}</h2>
        <div class="photo-grid"><RouterLink v-for="photo in group.photos" :key="photo.id" :to="`/gallery/${photo.id}`" class="photo-card" :aria-label="`${t('viewPhoto')}: ${photo.title || (photo.method === 'demo' ? t('testPhoto') : t('photo'))}`">
          <div class="photo-card-image"><PhotoThumbnail :id="photo.id" :alt="photo.title || (photo.method === 'demo' ? t('testPhoto') : t('photo'))" /><span v-if="photo.favorite" class="favorite-marker"><AppIcon name="star" /></span><span v-if="photo.method === 'demo'" class="demo-marker">DEMO</span></div>
          <div class="photo-card-caption"><span>{{ photo.title || (photo.method === 'demo' ? t('testPhoto') : t('photoTitlePlaceholder')) }}</span><span>{{ new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(photo.createdAt) }}</span></div>
        </RouterLink></div>
      </section>
    </template>
    <div v-else class="empty-gallery">
      <div class="gallery-illustration" aria-hidden="true"><span class="gallery-card rear" /><span class="gallery-card front"><AppIcon name="gallery" /></span></div>
      <h2>{{ photos.length ? t('noMatches') : t('galleryTitle') }}</h2><p class="supporting-copy">{{ photos.length ? t('noMatchesHint') : t('galleryDescription') }}</p>
      <RouterLink to="/" class="text-button">{{ t('backToCamera') }}<AppIcon name="arrow" /></RouterLink>
    </div>
  </section>
</template>
