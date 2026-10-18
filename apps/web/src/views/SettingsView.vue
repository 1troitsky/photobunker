<script setup lang="ts">
import { ref } from 'vue'
import ScreenHeader from '../components/ScreenHeader.vue'
import AppIcon from '../components/AppIcon.vue'
import { locale, setLocale, t, type Locale } from '../i18n'
import { q } from '../crypto/text'
import { a } from '../identity/text'
const languageSaved = ref(true)
function changeLanguage(value: Locale) { languageSaved.value = setLocale(value) }
</script>

<template>
  <section class="native-screen settings-screen">
    <ScreenHeader :title="t('settingsTitle')" back="/profile" />
    <div class="screen-body">
      <div class="settings-panel">
        <RouterLink to="/settings/data" class="account-link"><AppIcon name="device" /><span><strong>{{ q('Данные и хранилище') }}</strong><small>{{ q('Фотографии, занятое место и удаление аккаунта') }}</small></span><AppIcon name="chevron" /></RouterLink>
        <RouterLink to="/profile/security" class="account-link"><AppIcon name="lock" /><span><strong>{{ a('security') }}</strong><small>{{ a('devices') }}</small></span><AppIcon name="chevron" /></RouterLink>
      </div>
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
    </div>
  </section>
</template>
