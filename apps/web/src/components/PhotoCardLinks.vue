<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'
import type { PrivatePhotoCard } from '../studio/private-photo-card'
import { cardShareText as t } from '../studio/card-share-text'
import { CARD_ONLY, type CardScopes } from '../crypto/card-shares'
import { commitCardShare, revokeCardShare, listCardShareIntents,
  flushCardShares, type ShareRow } from '../crypto/card-share-outbox'
import { account, deviceId, sessionState, hasConfirmedIdentity } from '../identity/store'
import { appLocked } from '../app/lock'
import { photoReadAllowed, strongUnlocked, warmLocked } from '../crypto/store'

const props = defineProps<{ card: PrivatePhotoCard; shareAllowed: boolean }>()
const metadata = ref(false), duration = ref(3600)
const busy = ref(false), error = ref(''), rows = ref<ShareRow[]>([]), copied = ref('')
const eligible = computed(() => props.shareAllowed && !appLocked.value && photoReadAllowed())
let generation = 0
function reset() {
  generation++
  rows.value = []
  busy.value = false
  error.value = ''
  copied.value = ''
  metadata.value = false
}
async function load() {
  const token = ++generation, owner = account.value?.id, id = props.card.id
  try {
    const result = await listCardShareIntents(id)
    if (token === generation && owner === account.value?.id && id === props.card.id)
      rows.value = result
  } catch {
    if (token === generation && owner === account.value?.id) error.value = t('failed')
  }
}
async function create() {
  if (!eligible.value || busy.value) return
  const token = generation, owner = account.value?.id
  busy.value = true
  error.value = ''
  try {
    const scopes: CardScopes = { ...CARD_ONLY, metadata: metadata.value }
    const expiresAt = Math.min(Date.now() + duration.value * 1000, props.card.expiresAt ?? 0)
    const created = await commitCardShare(props.card.id, props.card, scopes, expiresAt,
      duration.value as 3600 | 86400 | 604800)
    if (token !== generation || owner !== account.value?.id) return
    rows.value = [created, ...rows.value]
  } catch {
    if (token === generation && owner === account.value?.id) error.value = t('failed')
  } finally {
    if (token === generation) busy.value = false
  }
}
async function revoke(id: string) {
  const token = generation, owner = account.value?.id
  try {
    await revokeCardShare(id)
    if (token === generation && owner === account.value?.id) await load()
  } catch {
    if (token === generation && owner === account.value?.id) error.value = t('failed')
  }
}
async function copy(row: ShareRow) {
  if (row.state === 'revoking' || row.state === 'revoked' || !eligible.value) return
  const token = generation, owner = account.value?.id
  try {
    await navigator.clipboard.writeText(row.url)
    if (token === generation && owner === account.value?.id) copied.value = row.id
  } catch {
    if (token === generation && owner === account.value?.id) error.value = t('failed')
  }
}
async function retry() {
  const token = generation, owner = account.value?.id
  try {
    if (!hasConfirmedIdentity()) throw new Error('offline')
    await flushCardShares()
    if (token === generation && owner === account.value?.id) await load()
  } catch {
    if (token === generation && owner === account.value?.id) error.value = t('failed')
  }
}
watch([() => props.card.id, () => props.shareAllowed, () => account.value?.id,
  deviceId, sessionState, appLocked, strongUnlocked, warmLocked],
  () => { reset(); if (eligible.value) void load() }, { immediate: true, flush: 'sync' })
function changed() { if (eligible.value) void load() }
onMounted(() => {
  window.addEventListener('photobunker-card-shares', changed)
  if (eligible.value) { void load(); void flushCardShares().catch(() => {}) }
})
onBeforeUnmount(() => {
  window.removeEventListener('photobunker-card-shares', changed)
  reset()
})
</script>
<template>
  <section class="photo-card-section photo-card-share" aria-labelledby="photo-card-share-heading">
    <h3 id="photo-card-share-heading">{{ t('share') }}</h3>
    <p class="field-hint">{{ t('hint') }}</p>
    <p v-if="!eligible" class="field-hint">{{ t('none') }}</p>
    <template v-else>
      <label class="toggle-row"><span><strong>{{ t('only') }}</strong></span>
        <input type="checkbox" checked disabled /></label>
      <label class="toggle-row"><span><strong>{{ t('metadata') }}</strong>
        <small>{{ t('metaHint') }}</small></span>
        <input type="checkbox" v-model="metadata" :disabled="busy" /></label>
      <label class="toggle-row"><span><strong>{{ t('photo') }}</strong></span><input type="checkbox" disabled /></label>
      <label class="toggle-row"><span><strong>{{ t('original') }}</strong></span><input type="checkbox" disabled /></label>
      <label class="toggle-row"><span><strong>{{ t('download') }}</strong></span><input type="checkbox" disabled /></label>
      <p class="field-hint">{{ t('imageBlocked') }}</p>
      <label class="photo-card-duration">{{ t('duration') }}
        <select v-model.number="duration" :disabled="busy">
          <option :value="3600">{{ t('hour') }}</option>
          <option :value="86400">{{ t('day') }}</option>
          <option :value="604800">{{ t('week') }}</option>
        </select>
      </label>
      <button class="primary-button photo-card-share-action" type="button" :disabled="busy"
        @click="create"><AppIcon name="share" />{{ t('create') }}</button>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <article v-for="item in rows" :key="item.id" class="photo-card-share-row">
        <p class="field-hint" role="status">{{ t(item.state) }}</p>
        <p v-if="item.lastError" class="form-error" role="alert">{{ t(item.lastError) }}</p>
        <template v-if="item.state !== 'revoking' && item.state !== 'revoked'">
          <textarea readonly rows="2" :value="item.url" :aria-label="t('share')" />
          <div class="photo-card-share-actions">
            <button type="button" class="secondary-button" :disabled="!!item.lastError" @click="copy(item)">
              <AppIcon name="copy" />{{ copied === item.id ? t('copied') : t('copy') }}</button>
            <button type="button" class="quiet-button subtle-danger" @click="revoke(item.id)">{{ t('revoke') }}</button>
          </div>
        </template>
      </article>
      <button v-if="rows.some(item => ['queued','sending','revoking'].includes(item.state))"
        class="quiet-button" type="button" @click="retry">{{ t('refresh') }}</button>
    </template>
  </section>
</template>
