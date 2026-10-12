<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from './components/AppIcon.vue'
import { locale, t } from './i18n'
import { localPrototype } from './local/photos'
import { startLibrary } from './local/library'
import { refreshProfiles } from './profiles/store'
import { p } from './profiles/text'
import { accessCode, accessSaved } from './server/api'

const route = useRoute()
const offline = ref(!navigator.onLine)
const main = ref<HTMLElement>()
let stopLibrary: (() => void) | undefined
const navigation = [
  { name: 'profiles', to: '/profiles', icon: 'profiles' },
  { name: 'camera', to: '/camera', icon: 'camera' },
  { name: 'gallery', to: '/gallery', icon: 'gallery' },
  { name: 'settings', to: '/settings', icon: 'settings' },
] as const

function updateConnection() { offline.value = !navigator.onLine }
function isActive(name: string) { return route.name === name || name === 'gallery' && route.name === 'photo' || name === 'profiles' && route.name === 'profile-edit' }
onMounted(() => {
  stopLibrary = startLibrary()
  void refreshProfiles()
  window.addEventListener('online', updateConnection)
  window.addEventListener('offline', updateConnection)
})
onBeforeUnmount(() => {
  stopLibrary?.()
  window.removeEventListener('online', updateConnection)
  window.removeEventListener('offline', updateConnection)
})
watch([() => route.name, locale], () => {
  document.title = `${route.name === 'profiles' || route.name === 'profile-edit' ? p('profiles') : t(route.name === 'gallery' || route.name === 'photo' ? 'gallery' : route.name === 'settings' ? 'settings' : 'camera')} · PhotoBunker`
}, { immediate: true })
watch(() => route.path, () => { main.value?.focus() }, { flush: 'post' })
</script>

<template>
  <a class="skip-link" href="#main">{{ t('skip') }}</a>
  <div class="app-shell">
    <header class="brand">
      <span class="brand-mark"><AppIcon name="camera" /></span>
      <div class="brand-copy"><span class="brand-name">PhotoBunker</span><span class="brand-tagline">{{ t('tagline') }}</span></div>
    </header>

    <span class="release-badge"><span class="release-dot" />{{ t(localPrototype ? 'prototype' : 'early') }}</span>

    <nav class="navigation" :aria-label="t('navigation')">
      <RouterLink v-for="item in navigation" :key="item.name" :to="item.to" :class="['nav-item', { active: isActive(item.name) }]" :aria-label="item.name === 'profiles' ? p('profiles') : t(item.name)" :aria-current="isActive(item.name) ? 'page' : undefined">
        <AppIcon :name="item.icon" /><span>{{ item.name === 'profiles' ? p('profiles') : t(item.name) }}</span><span class="nav-indicator" />
      </RouterLink>
    </nav>

    <p v-if="offline" class="offline-notice" role="status"><AppIcon name="offline" /><span><strong>{{ t('offline') }}</strong><span>{{ t(localPrototype ? 'offlineHint' : 'prototypeDisabled') }}</span></span></p>

    <main id="main" ref="main" class="main-content" tabindex="-1"><p v-if="localPrototype" class="prototype-note">{{ t('prototypeNote') }}</p><p v-if="localPrototype && accessCode && !accessSaved" class="server-warning" role="status">{{ t('accessNotSaved') }} <RouterLink to="/settings">{{ t('settings') }}</RouterLink></p><RouterView /></main>
    <span class="sidebar-caption">{{ t('version') }}</span>
  </div>
</template>
