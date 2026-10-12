<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { locale, setLocale, t } from '../i18n'
import type { Locale } from '../i18n'
import { formatBytes, libraryChanged, photos, usedBytes } from '../local/library'
import { clearPhotos, localPrototype } from '../local/photos'
import { accessCode, accessSaved, restoreAccess } from '../server/api'

const languageSaved = ref(true)
const clearing = ref(false)
const clearStatus = ref<Parameters<typeof t>[0]>()
const showCode = ref(false)
const restoreCode = ref('')
const connecting = ref(false)
const serverStatus = ref<Parameters<typeof t>[0]>()
async function restore() {
  if (connecting.value) return
  connecting.value = true; serverStatus.value = undefined
  try { await restoreAccess(restoreCode.value); restoreCode.value = ''; showCode.value = false; libraryChanged(); serverStatus.value = 'restoreSuccess' }
  catch { serverStatus.value = 'restoreFailed' }
  finally { connecting.value = false }
}
async function copyCode() {
  try { await navigator.clipboard.writeText(accessCode.value); serverStatus.value = 'accessCopied' }
  catch { serverStatus.value = 'accessCopyFailed' }
}
function changeLanguage(value: Locale) { languageSaved.value = setLocale(value) }
async function clear() {
  if (clearing.value || !window.confirm(t('clearQuestion'))) return
  clearing.value = true; clearStatus.value = undefined
  try { await clearPhotos(); libraryChanged(); clearStatus.value = 'cleared' }
  catch { clearStatus.value = 'deleteFailed' }
  finally { clearing.value = false }
}
</script>

<template>
  <section class="content-screen settings-screen" aria-labelledby="settings-title">
    <header class="page-heading"><p class="eyebrow">{{ t('settingsEyebrow') }}</p><h1 id="settings-title">{{ t('settingsTitle') }}</h1><p>{{ t('settingsDescription') }}</p></header>
    <div class="settings-panel">
      <div class="setting-row">
        <span class="setting-icon"><AppIcon name="globe" /></span>
        <div class="setting-description"><h2 id="language-label">{{ t('language') }}</h2><p>{{ t('languageHint') }}</p></div>
        <div class="language-switch" role="group" aria-labelledby="language-label">
          <button lang="ru" :aria-pressed="locale === 'ru'" @click="changeLanguage('ru')">Русский</button>
          <button lang="en" :aria-pressed="locale === 'en'" @click="changeLanguage('en')">English</button>
        </div>
      </div>
      <p v-if="!languageSaved" class="preference-notice" role="status">{{ t('languageUnavailable') }}</p>
    </div>
    <div v-if="localPrototype" class="settings-panel library-settings">
      <div class="setting-row"><span class="setting-icon"><AppIcon name="device" /></span><div class="setting-description"><h2>{{ t('localLibrary') }}</h2><p>{{ t('localLibraryHint') }}</p></div><span class="storage-total">{{ photos.length }} · {{ formatBytes(usedBytes) }}</span></div>
      <button class="danger-button" :disabled="clearing || !photos.length" @click="clear">{{ t('clearPhotos') }}</button>
      <p class="supporting-copy">{{ t('clearLocalHint') }}</p>
      <p v-if="clearStatus" class="capture-feedback" role="status">{{ t(clearStatus) }}</p>
    </div>
    <div v-if="localPrototype" class="settings-panel server-settings">
      <h2>{{ t('serverLibrary') }}</h2><p class="supporting-copy">{{ t('serverLibraryHint') }}</p>
      <template v-if="accessCode">
        <p class="supporting-copy">{{ t('accessCodeHint') }}</p>
        <button class="secondary-button" @click="showCode = !showCode">{{ t(showCode ? 'hideAccessCode' : 'showAccessCode') }}</button>
        <div v-if="showCode" class="access-code"><label for="access-code">{{ t('accessCode') }}</label><textarea id="access-code" :value="accessCode" readonly rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" /><button class="secondary-button" @click="copyCode">{{ t('copyAccessCode') }}</button></div>
        <p v-if="!accessSaved" class="server-warning" role="status">{{ t('accessNotSaved') }}</p>
      </template>
      <form class="restore-form" @submit.prevent="restore"><h3>{{ t('restoreLibrary') }}</h3><p class="supporting-copy">{{ t('restoreLibraryHint') }}</p><label for="restore-code">{{ t('accessCode') }}</label><input id="restore-code" v-model="restoreCode" :disabled="connecting" type="password" autocomplete="off" spellcheck="false" autocapitalize="off"><button class="primary-button" :disabled="connecting || !restoreCode.trim()">{{ t('restoreAction') }}</button></form>
      <p v-if="serverStatus" class="capture-feedback" role="status">{{ t(serverStatus) }}</p>
    </div>
    <div class="settings-panel upcoming-panel">
      <div class="setting-row"><span class="setting-icon"><AppIcon name="lock" /></span><div class="setting-description"><h2>{{ t('security') }}</h2><p>{{ t('securityHint') }}</p></div></div>
      <p class="upcoming-label">{{ t('comingLater') }}</p>
    </div>
  </section>
</template>
