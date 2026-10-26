<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ScreenHeader from '../components/ScreenHeader.vue'
import AppIcon from '../components/AppIcon.vue'
import PrivateLocationMap from '../components/PrivateLocationMap.vue'
import { photos } from '../local/library'
import { account, sessionState } from '../identity/store'
import { appLockReady, appLocked } from '../app/lock'
import { protectionEnabled, strongUnlocked, warmLocked } from '../crypto/store'
import { readPrivateCardPhoto, privateCardScopeAllowed } from '../studio/photo-card-reader'
import { privatePhotoCard, type PrivatePhotoCard } from '../studio/private-photo-card'
import { photoCardText as t } from '../studio/photo-card-text'
import { profilePath } from '../identity/person'
import { locale } from '../i18n'

const route = useRoute()
const card = ref<PrivatePhotoCard>()
const ownerOfCard = ref('')
const loading = ref(false)
const error = ref<'offline' | 'denied' | 'locked' | 'unavailable'>()
const expanded = ref(false)
const copied = ref(false)
const now = ref(Date.now())
const id = computed(() => String(route.params.id ?? ''))
const galleryLink = computed(() => '/gallery/' + encodeURIComponent(id.value))
const inGallery = computed(() => photos.value.some(item =>
  item.id === id.value && !item.deleteRequested &&
  (item.expiresAt === undefined || item.expiresAt > now.value)))
const visible = computed(() =>
  privateCardScopeAllowed() && ownerOfCard.value === account.value?.id &&
  !!card.value && (card.value.expiresAt === undefined || card.value.expiresAt > now.value)
    ? card.value : undefined)
const dateTime = (value: number) => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(value)
const coordinates = computed(() => visible.value?.location
  ? visible.value.location.latitude.toFixed(6) + ', ' +
    visible.value.location.longitude.toFixed(6) : '')

let generation = 0
function invalidate() {
  generation++
  card.value = undefined
  ownerOfCard.value = ''
  loading.value = false
  error.value = undefined
  expanded.value = false
  copied.value = false
}
async function load() {
  const token = ++generation, owner = account.value?.id, photoId = id.value
  card.value = undefined
  ownerOfCard.value = ''
  error.value = undefined
  copied.value = false
  expanded.value = false
  loading.value = true
  try {
    if (!privateCardScopeAllowed()) throw new Error('photo_card.locked')
    const photo = await readPrivateCardPhoto(photoId)
    const projection = privatePhotoCard(photo)
    if (token !== generation || owner !== account.value?.id ||
        photoId !== id.value || !privateCardScopeAllowed()) return
    ownerOfCard.value = owner || ''
    card.value = projection
  } catch (reason) {
    if (token !== generation || owner !== account.value?.id || photoId !== id.value) return
    const message = reason instanceof Error ? reason.message : ''
    const status = (reason as { status?: number } | null)?.status
    error.value = status === 403 || /denied|permission|access/.test(message)
      ? 'denied'
      : status === 404 || status === 410 || /expired|unavailable|deleted|not.found/.test(message)
        ? 'unavailable'
        : /locked|account_changed|cancelled/.test(message) ? 'locked' : 'offline'
  } finally {
    if (token === generation) loading.value = false
  }
}
// Flush sync ensures the previous account's content disappears before paint.
watch([id, () => account.value?.id, sessionState, appLockReady, appLocked,
  protectionEnabled, strongUnlocked, warmLocked], () => {
  invalidate()
  if (privateCardScopeAllowed()) void load()
  else error.value = 'locked'
}, { immediate: true, flush: 'sync' })
async function copyCoordinates() {
  if (!visible.value?.location || !coordinates.value) return
  try {
    await navigator.clipboard.writeText(coordinates.value)
    if (visible.value?.location) copied.value = true
  } catch { copied.value = false }
}
const expiry = setInterval(() => {
  now.value = Date.now()
  if (card.value?.expiresAt !== undefined && card.value.expiresAt <= now.value) {
    invalidate()
    error.value = 'unavailable'
  }
}, 1000)
onBeforeUnmount(() => { invalidate(); clearInterval(expiry) })
</script>

<template>
  <section class="native-screen photo-card-screen">
    <ScreenHeader :title="t('photoCard')" :back="galleryLink">
      <span class="photo-card-private-label"><AppIcon name="lock" />{{ t('private') }}</span>
    </ScreenHeader>
    <div class="screen-body photo-card-body">
      <div v-if="loading && !visible" class="native-empty" role="status">
        <AppIcon name="info" /><p>{{ t('loading') }}</p>
      </div>
      <div v-else-if="!visible" class="native-empty">
        <AppIcon name="lock" />
        <h2>{{ t('unavailable') }}</h2>
        <p role="alert">{{ t(error === 'offline' ? 'offline' :
          error === 'denied' ? 'denied' : error === 'locked' ? 'locked' : 'unavailableHint') }}</p>
        <button class="primary-button" type="button" @click="load">{{ t('retry') }}</button>
      </div>
      <template v-else>
        <div class="photo-card-intro">
          <span class="photo-card-kicker">{{ t('private') }}</span>
          <h2>{{ visible.title || t('noTitle') }}</h2>
          <p v-if="visible.nameId" class="photo-card-name-id">
            <span>{{ t('nameId') }}</span><strong>{{ visible.nameId }}</strong>
          </p>
          <p v-else-if="visible.namePending" class="field-hint" role="status">{{ t('pendingId') }}</p>
          <p v-if="visible.description" class="photo-card-description">{{ visible.description }}</p>
        </div>
        <div class="photo-card-content">
          <section class="photo-card-section">
            <dl class="native-facts">
              <div>
                <dt>{{ t('expires') }}</dt>
                <dd>{{ visible.expiresAt && Number.isFinite(visible.expiresAt)
                  ? dateTime(visible.expiresAt) : t('noExpiry') }}</dd>
              </div>
              <div v-if="visible.capturedAt">
                <dt>{{ t('captured') }}</dt>
                <dd>{{ dateTime(visible.capturedAt) }}</dd>
              </div>
              <div v-if="visible.author">
                <dt>{{ t('author') }}</dt>
                <dd><RouterLink :to="profilePath(visible.author.publicId)">
                  {{ visible.author.publicId }}</RouterLink></dd>
              </div>
            </dl>
            <RouterLink v-if="inGallery" :to="galleryLink" class="secondary-button photo-card-gallery">
              <AppIcon name="gallery" />{{ t('gallery') }}
            </RouterLink>
          </section>
          <section v-if="visible.location" class="photo-card-section">
            <h3>{{ t('location') }}</h3>
            <div class="photo-card-coordinate-row">
              <code>{{ coordinates }}</code>
              <button type="button" class="secondary-button" :aria-label="t('copy')"
                @click="copyCoordinates">
                <AppIcon name="copy" />{{ copied ? t('copied') : t('copy') }}
              </button>
            </div>
            <PrivateLocationMap :latitude="visible.location.latitude" :longitude="visible.location.longitude" />
          </section>
          <section v-if="visible.metadata" class="photo-card-section">
            <button type="button" class="photo-card-expand" :aria-expanded="expanded"
              @click="expanded = !expanded">
              <span>{{ t(expanded ? 'hideMetadata' : 'metadata') }}</span>
              <AppIcon name="chevron" />
            </button>
            <dl v-if="expanded" class="native-facts photo-card-technical">
              <div v-if="visible.metadata.camera"><dt>{{ t('camera') }}</dt><dd>{{ visible.metadata.camera }}</dd></div>
              <div><dt>{{ t('dimensions') }}</dt><dd>{{ visible.metadata.width }} × {{ visible.metadata.height }}</dd></div>
              <div><dt>{{ t('bytes') }}</dt><dd>{{ visible.metadata.bytes }}</dd></div>
              <div><dt>{{ t('format') }}</dt><dd>{{ visible.metadata.mime }}</dd></div>
              <div><dt>{{ t('method') }}</dt><dd>{{ visible.metadata.method }}</dd></div>
              <div v-if="visible.metadata.accuracy !== undefined">
                <dt>{{ t('accuracy') }}</dt><dd>± {{ Math.round(visible.metadata.accuracy) }} m</dd>
              </div>
            </dl>
          </section>
        </div>
      </template>
    </div>
  </section>
</template>
