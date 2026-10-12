<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { t } from '../i18n'
</script>

<template>
  <section class="content-screen gallery-screen" aria-labelledby="gallery-title">
    <header class="page-heading"><p class="eyebrow">{{ t('galleryEyebrow') }}</p><h1>{{ t('gallery') }}</h1></header>
    <div class="empty-gallery">
      <div class="gallery-illustration" aria-hidden="true"><span class="gallery-card rear" /><span class="gallery-card front"><AppIcon name="gallery" /></span><span class="illustration-lock"><AppIcon name="lock" /></span></div>
      <h2 id="gallery-title">{{ t('galleryTitle') }}</h2>
      <p class="supporting-copy">{{ t('galleryDescription') }}</p>
      <RouterLink to="/" class="text-button">{{ t('backToCamera') }}<AppIcon name="arrow" /></RouterLink>
    </div>
  </section>
</template>
