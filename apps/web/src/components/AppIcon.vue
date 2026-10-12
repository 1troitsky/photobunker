<script setup lang="ts">
defineProps<{ name: 'profiles' | 'camera' | 'gallery' | 'settings' | 'lock' | 'flip' | 'arrow' | 'offline' | 'globe' | 'device' | 'close' | 'star' | 'back' | 'trash' | 'download' }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'profiles'"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h5M8 16h8" /></template>
    <template v-else-if="name === 'camera'">
      <path d="M3 7h5l2-3h4l2 3h5v13H3z" /><circle cx="12" cy="13" r="4" />
    </template>
    <template v-else-if="name === 'gallery'">
      <rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1" /><path d="m4 17 5-5 4 4 3-3 5 5" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="9" cy="18" r="2" fill="currentColor" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </template>
    <template v-else-if="name === 'flip'">
      <path d="M20 7h-5V2M4 17h5v5M20 7a8 8 0 0 0-14-2m-2 12a8 8 0 0 0 14 2" />
    </template>
    <path v-else-if="name === 'arrow'" d="M5 12h14m-5-5 5 5-5 5" />
    <template v-else-if="name === 'offline'">
      <path d="m3 3 18 18M8 8a10 10 0 0 1 13 1M3 9a14 14 0 0 1 2-1m3 5a6 6 0 0 1 8 0m-5 4h2" />
    </template>
    <template v-else-if="name === 'globe'">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18m-9-9a17 17 0 0 0 0 18 17 17 0 0 0 0-18" />
    </template>
    <template v-else-if="name === 'device'"><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></template>
    <path v-else-if="name === 'close'" d="m6 6 12 12M6 18 18 6" />
    <path v-else-if="name === 'star'" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />
    <path v-else-if="name === 'back'" d="M19 12H5m5-5-5 5 5 5" />
    <template v-else-if="name === 'trash'"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" /></template>
    <template v-else-if="name === 'download'"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" /></template>
  </svg>
</template>
