<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import { locale, setLocale, t } from '../i18n'
import type { Locale } from '../i18n'
import { formatBytes, libraryChanged, photos, usedBytes } from '../local/library'
import { clearPhotos, localPrototype } from '../local/photos'

const languageSaved = ref(true)
const clearing = ref(false)
const clearStatus = ref<Parameters<typeof t>[0]>()
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
      <p v-if="clearStatus" class="capture-feedback" role="status">{{ t(clearStatus) }}</p>
    </div>
    <div class="settings-panel upcoming-panel">
      <div class="setting-row"><span class="setting-icon"><AppIcon name="lock" /></span><div class="setting-description"><h2>{{ t('security') }}</h2><p>{{ t('securityHint') }}</p></div></div>
      <p class="upcoming-label">{{ t('comingLater') }}</p>
    </div>
  </section>
</template>
