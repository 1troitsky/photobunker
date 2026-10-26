<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PrivateLocationMap from '../components/PrivateLocationMap.vue'
import { decryptCard, type CardManifest, type PublicCard } from '../crypto/card-shares'
import { cardShareText as t } from '../studio/card-share-text'
import { locale } from '../i18n'

const route = useRoute()
const id = String(route.params.id)
let secret = location.hash.slice(1)
// Fragment-only capability: remove from current address/history *before*
// any network request, analytics, or third-party component can observe it.
history.replaceState(history.state, '', location.pathname + location.search)
const card = ref<PublicCard>(), error = ref<'invalid'|'expired'|'unavailable'>()
const loading = ref(true), details = ref(false), now = ref(Date.now())
let disposed = false, timer: ReturnType<typeof setInterval> | undefined
let controller = new AbortController()
function clear() { card.value = undefined; secret = ''; details.value = false }
async function requestPart(url: string, format: 'json'|'blob') {
  const response = await fetch(url, { credentials: 'omit', cache: 'no-store',
    redirect: 'error', signal: controller.signal, referrerPolicy: 'no-referrer' })
  if (!response.ok) {
    if (response.status === 410) throw new Error('expired')
    if (response.status === 403) throw new Error('invalid')
    throw new Error(response.status >= 500 ? 'unavailable' : 'invalid')
  }
  return format === 'blob' ? response.blob() : response.json()
}
async function verifyAlive() {
  const manifest = await requestPart('/api/v1/cards/' + encodeURIComponent(id), 'json') as CardManifest
  if (manifest.id !== id || manifest.type !== 'photo-card' || manifest.version !== 2)
    throw new Error('invalid')
  return manifest
}
async function load() {
  error.value = undefined; loading.value = true
  try {
    if (!secret) throw new Error('invalid')
    const manifest = await verifyAlive()
    const blob = await requestPart('/api/v1/cards/' + encodeURIComponent(id) + '/content', 'blob') as Blob
    const decrypted = await decryptCard(blob, manifest, secret)
    if (disposed) return
    card.value = decrypted
    // The card is still constrained by its actual expiry in the browser.
  } catch (reason) {
    if (!disposed) { clear(); const message = reason instanceof Error ? reason.message : ''
      error.value = message === 'expired' ? 'expired' : message === 'unavailable' ? 'unavailable' : 'invalid'
    }
  } finally { if (!disposed) loading.value = false }
}
function hide() {
  clear(); controller.abort()
  error.value = 'invalid'
}
function date(value: number) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}
onMounted(() => {
  void load()
  timer = setInterval(async () => {
    if (!card.value) return
    now.value = Date.now()
    if (card.value.expiresAt <= now.value) { clear(); error.value = 'expired'; return }
    // Revoke/deletion cannot be detected offline. Online revalidate the
    // independent manifest endpoint; never fetch an image object.
    if (!navigator.onLine) return
    try { await verifyAlive() }
    catch { if (!disposed) { clear(); error.value = 'expired' } }
  }, 10000)
  window.addEventListener('pagehide', hide)
})
onBeforeUnmount(() => {
  disposed = true; clear(); controller.abort()
  if (timer) clearInterval(timer)
  window.removeEventListener('pagehide', hide)
})
</script>

<template>
  <section class="native-screen photo-card-screen shared-card-screen">
    <header class="screen-header"><span class="screen-monogram" aria-hidden="true">pb</span>
      <div class="screen-title"><h1>{{ t('title') }}</h1></div></header>
    <div class="screen-body photo-card-body">
      <div v-if="loading" class="native-empty" role="status"><p>{{ t('pending') }}</p></div>
      <div v-else-if="error || !card" class="native-empty">
        <h2>{{ t(error || 'invalid') }}</h2>
        <p>{{ t('hint') }}</p>
      </div>
      <template v-else>
        <div class="photo-card-intro">
          <span class="photo-card-kicker">{{ t('title') }}</span>
          <h2>{{ card.title }}</h2>
          <p v-if="card.description" class="photo-card-description">{{ card.description }}</p>
        </div>
        <div class="photo-card-content">
          <section class="photo-card-section"><dl class="native-facts">
            <div><dt>{{ t('expiry') }}</dt><dd>{{ date(card.expiresAt) }}</dd></div>
            <div v-if="card.capturedAt"><dt>{{ t('capture') }}</dt><dd>{{ date(card.capturedAt) }}</dd></div>
            <div v-if="card.author"><dt>{{ t('author') }}</dt><dd>{{ card.author.publicId }}</dd></div>
          </dl></section>
          <section v-if="card.location" class="photo-card-section">
            <h3>{{ t('location') }}</h3>
            <PrivateLocationMap :latitude="card.location.latitude" :longitude="card.location.longitude" />
          </section>
          <section v-if="card.metadata" class="photo-card-section">
            <button class="photo-card-expand" type="button" :aria-expanded="details" @click="details = !details">
              {{ t('details') }}
            </button>
            <dl v-if="details" class="native-facts">
              <div v-if="card.metadata.camera"><dt>{{ t('details') }}</dt><dd>{{ card.metadata.camera }}</dd></div>
              <div v-if="card.metadata.width && card.metadata.height">
                <dt>{{ t('details') }}</dt><dd>{{ card.metadata.width }} × {{ card.metadata.height }}</dd></div>
              <div v-if="card.metadata.mime"><dt>{{ t('details') }}</dt><dd>{{ card.metadata.mime }}</dd></div>
            </dl>
          </section>
        </div>
      </template>
    </div>
  </section>
</template>
