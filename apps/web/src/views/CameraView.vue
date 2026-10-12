<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { t } from '../i18n'
</script>

<template>
  <section class="camera-screen" aria-labelledby="camera-title">
    <div class="viewfinder">
      <div class="viewfinder-top"><AppIcon name="lock" /><span>{{ t('noVault') }}</span></div>
      <span class="frame-corner top-left" /><span class="frame-corner top-right" /><span class="frame-corner bottom-left" /><span class="frame-corner bottom-right" />
      <div class="camera-message">
        <span class="camera-emblem"><AppIcon name="camera" /><span class="emblem-cross">+</span></span>
        <p class="eyebrow">{{ t('cameraEyebrow') }}</p>
        <h1 id="camera-title">{{ t('cameraTitle') }}</h1>
        <p class="supporting-copy">{{ t('cameraDescription') }}</p>
      </div>
      <div class="viewfinder-bottom"><span class="viewfinder-line" /><span>PhotoBunker</span><span class="viewfinder-line" /></div>
    </div>
    <div class="camera-controls">
      <p class="photo-mode">{{ t('photoMode') }}</p>
      <div class="capture-controls">
        <RouterLink to="/gallery" class="archive-button" :aria-label="t('gallery')"><AppIcon name="gallery" /></RouterLink>
        <button type="button" class="shutter" disabled :aria-label="t('cameraUnavailable')" aria-describedby="capture-note"><span /></button>
        <button type="button" class="flip-button" disabled :aria-label="t('cameraFlip')"><AppIcon name="flip" /></button>
      </div>
      <p id="capture-note" class="capture-note">{{ t('captureNote') }}</p>
    </div>
  </section>
</template>
