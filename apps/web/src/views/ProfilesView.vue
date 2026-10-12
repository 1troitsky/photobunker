<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { activeProfile, profiles, profilesError, profilesLoading, refreshProfiles, saveProfile, selectProfile } from '../profiles/store'
import { defaultRules, type Profile } from '../profiles/model'
import { p } from '../profiles/text'
import { photos } from '../local/library'
import { t } from '../i18n'
const router = useRouter()
const busy = ref(false); const error = ref(false); const showArchived = ref(false)
const visible = computed(() => profiles.value.filter(profile => !!profile.archived === showArchived.value))
function shoot(profile: Profile) { selectProfile(profile.id); void router.push('/camera') }
async function personal() {
  busy.value = true; error.value = false
  try { const profile = await saveProfile({ id: crypto.randomUUID(), version: 0, name: p('personalName'), description: '', rules: defaultRules() }); shoot(profile) }
  catch { error.value = true } finally { busy.value = false }
}
async function archive(profile: Profile) {
  if (!profile.archived && !confirm(p('archiveHint'))) return
  busy.value = true; error.value = false
  try { await saveProfile({ ...profile, archived: !profile.archived }) } catch { error.value = true } finally { busy.value = false }
}
function count(profile: Profile) { return photos.value.filter(photo => photo.profile?.id === profile.id).length }
function completed(profile: Profile) { return new Set(photos.value.filter(photo => photo.profile?.id === profile.id && photo.shot && profile.rules.shotList.includes(photo.shot)).map(photo => photo.shot)).size }
onMounted(refreshProfiles)
</script>
<template>
  <section class="content-screen profiles-screen">
    <header class="page-heading profile-heading"><div><p class="eyebrow">PHOTOBUNKER</p><h1>{{ p('profiles') }}</h1><p class="supporting-copy">{{ p('intro') }}</p></div><RouterLink to="/profiles/new" class="primary-button">＋ {{ p('create') }}</RouterLink></header>
    <p v-if="profilesError" class="server-warning" role="status">{{ p('serverError') }} <button class="quiet-button" @click="refreshProfiles">{{ t('retry') }}</button></p>
    <p v-if="error" class="server-warning" role="alert">{{ p('failed') }}</p>
    <div v-if="profiles.length" class="profile-list-toolbar"><button class="quiet-button" :aria-pressed="showArchived" @click="showArchived = !showArchived">{{ showArchived ? p('profiles') : p('archived') }}</button></div>
    <p v-if="profilesLoading && !profiles.length" class="loading-state">{{ t('loading') }}</p>
    <div v-else-if="!profiles.length" class="profile-welcome"><span class="camera-emblem"><AppIcon name="profiles" /></span><h2>{{ p('empty') }}</h2><p class="supporting-copy">{{ p('emptyHint') }}</p><button class="primary-button" :disabled="busy" @click="personal">{{ p('personal') }}</button><RouterLink to="/profiles/new" class="quiet-button">{{ p('create') }} <AppIcon name="arrow" /></RouterLink></div>
    <div v-else class="profile-grid">
      <article v-for="profile in visible" :key="profile.id" :class="['profile-card', { 'profile-selected': activeProfile?.id === profile.id }]">
        <div class="profile-card-top"><span class="profile-symbol"><AppIcon name="profiles" /></span><span v-if="activeProfile?.id === profile.id" class="profile-chip">{{ p('active') }}</span><span v-else class="profile-version">{{ p('version') }} {{ profile.version }}</span></div>
        <h2>{{ profile.name }}</h2><p v-if="profile.description" class="profile-description">{{ profile.description }}</p>
        <div class="profile-rule-tags"><span>{{ profile.rules.resolution === 'maximum' ? p('maximum') : `${profile.rules.width} × ${profile.rules.height}` }}</span><span>{{ profile.rules.aspect === 'native' ? p('native') : profile.rules.aspect === 'custom' ? `${profile.rules.aspectWidth}:${profile.rules.aspectHeight}` : profile.rules.aspect }}</span><span>{{ p(profile.rules.metadata) }}</span></div>
        <div class="profile-stats"><span>{{ p('photos') }} <strong>{{ count(profile) }}</strong></span><span v-if="profile.rules.shotList.length">{{ p('shotProgress') }} <strong>{{ completed(profile) }}/{{ profile.rules.shotList.length }}</strong></span></div>
        <button v-if="!profile.archived" class="primary-button" :disabled="busy" @click="shoot(profile)"><AppIcon name="camera" />{{ p('shoot') }}</button>
        <div class="profile-card-actions"><RouterLink :to="`/profiles/${profile.id}`">{{ p('editAction') }}</RouterLink><RouterLink :to="`/gallery?profile=${profile.id}`">{{ p('materials') }}</RouterLink><RouterLink :to="`/profiles/new?copy=${profile.id}`">{{ p('copy') }}</RouterLink><button :disabled="busy" @click="archive(profile)">{{ p(profile.archived ? 'restore' : 'archive') }}</button></div>
      </article>
    </div>
  </section>
</template>
