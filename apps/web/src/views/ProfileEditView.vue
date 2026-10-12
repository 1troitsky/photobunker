<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { defaultRules, aspectRatio, type Profile } from '../profiles/model'
import { profiles, refreshProfiles, saveProfile, selectProfile } from '../profiles/store'
import { p } from '../profiles/text'
import { ServerError } from '../server/api'
import { t } from '../i18n'
const route = useRoute(); const router = useRouter()
const profile = ref<Profile>({ id: crypto.randomUUID(), name: '', description: '', version: 0, rules: defaultRules() })
const categories = ref(''); const shots = ref(''); const busy = ref(false); const loaded = ref(false)
const error = ref<'failed' | 'conflict' | 'invalid'>(); let initial = ''; let saved = false
const newProfile = computed(() => route.params.id === 'new')
const dirty = computed(() => loaded.value && `${JSON.stringify(profile.value)}|${categories.value}|${shots.value}` !== initial)
onMounted(async () => {
  await refreshProfiles()
  const id = newProfile.value ? route.query.copy : route.params.id
  if (id) {
    const source = profiles.value.find(item => item.id === id)
    if (!source) { error.value = 'failed'; return }
    profile.value = JSON.parse(JSON.stringify(source))
    if (newProfile.value) { profile.value.id = crypto.randomUUID(); profile.value.version = 0; profile.value.archived = false; profile.value.name = (profile.value.name + p('copySuffix')).slice(0, 80) }
  }
  categories.value = profile.value.rules.categories.join('\n'); shots.value = profile.value.rules.shotList.join('\n')
  initial = `${JSON.stringify(profile.value)}|${categories.value}|${shots.value}`; loaded.value = true
})
function metadataChanged() {
  const rules = profile.value.rules
  if (rules.metadata === 'none') { rules.keepDate = rules.keepCamera = false; rules.location = 'off' }
  if (rules.metadata === 'all') { rules.keepDate = rules.keepCamera = true; if (rules.location === 'off') rules.location = 'optional' }
}
function dimensionsChanged(axis: 'width' | 'height' = 'width') {
  const rules = profile.value.rules
  if (rules.resolution !== 'fixed' || rules.aspect === 'native') return
  const ratio = aspectRatio(rules)!
  if (axis === 'width') rules.height = Math.round(rules.width / ratio)
  else rules.width = Math.round(rules.height * ratio)
}
watch(() => profile.value.rules.aspect, () => dimensionsChanged())
async function save() {
  if (busy.value || !loaded.value) return
  error.value = undefined
  const list = (value: string) => [...new Set(value.split('\n').map(item => item.trim()).filter(Boolean))]
  const rules = { ...profile.value.rules, categories: list(categories.value), shotList: list(shots.value), idPrefix: profile.value.rules.idPrefix.trim().toUpperCase() }
  if ([rules.categories, rules.shotList].some(items => items.length > 30 || items.some(item => item.length > 80)) || rules.categoryRequired && !rules.categories.length || rules.resolution === 'fixed' && rules.width * rules.height > 50_000_000) { error.value = 'invalid'; return }
  busy.value = true
  try { const result = await saveProfile({ ...profile.value, name: profile.value.name.trim(), rules }); selectProfile(result.id); saved = true; await router.push('/profiles') }
  catch (cause) { error.value = cause instanceof ServerError && cause.status === 409 ? 'conflict' : cause instanceof ServerError && cause.status === 422 ? 'invalid' : 'failed' }
  finally { busy.value = false }
}
onBeforeRouteLeave(() => saved || !busy.value && (!dirty.value || confirm(p('leave'))))
</script>
<template>
  <section class="content-screen profile-editor">
    <RouterLink to="/profiles" class="back-link">← {{ p('back') }}</RouterLink>
    <header class="page-heading"><p class="eyebrow">{{ p('profile') }}</p><h1>{{ p(newProfile ? 'new' : 'edit') }}</h1></header>
    <p v-if="!loaded && !error" class="loading-state">{{ t('loading') }}</p>
    <form v-if="loaded" class="profile-form" @submit.prevent="save">
      <fieldset :disabled="busy"><legend>{{ p('basics') }}</legend><label>{{ p('name') }}<input v-model="profile.name" required maxlength="80" autofocus></label><label>{{ p('description') }}<textarea v-model="profile.description" rows="2" maxlength="1000" /></label></fieldset>
      <fieldset :disabled="busy"><legend>{{ p('image') }}</legend>
        <div class="profile-fields"><label>{{ p('resolution') }}<select :aria-label="p('resolution')" v-model="profile.rules.resolution" @change="dimensionsChanged()"><option value="maximum">{{ p('maximum') }}</option><option value="fixed">{{ p('fixed') }}</option></select></label><label>{{ p('aspect') }}<select :aria-label="p('aspect')" v-model="profile.rules.aspect"><option value="native">{{ p('native') }}</option><option v-for="ratio in ['1:1', '4:3', '3:2', '16:9']" :key="ratio" :value="ratio">{{ ratio }}</option><option value="custom">{{ p('custom') }}</option></select></label></div>
        <div v-if="profile.rules.aspect === 'custom'" class="profile-fields"><label>{{ p('ratioWidth') }}<input v-model.number="profile.rules.aspectWidth" type="number" required min="1" max="100" @change="dimensionsChanged()"></label><label>{{ p('ratioHeight') }}<input v-model.number="profile.rules.aspectHeight" type="number" required min="1" max="100" @change="dimensionsChanged()"></label></div>
        <div v-if="profile.rules.resolution === 'fixed'" class="profile-fields"><label>{{ p('width') }}<input v-model.number="profile.rules.width" type="number" required min="64" max="16384" @change="dimensionsChanged('width')"></label><label>{{ p('height') }}<input v-model.number="profile.rules.height" type="number" required min="64" max="16384" @change="dimensionsChanged('height')"></label></div>
        <div class="profile-fields"><label>{{ p('fit') }}<select :aria-label="p('fit')" v-model="profile.rules.fit"><option value="crop">{{ p('crop') }}</option><option value="contain">{{ p('contain') }}</option></select></label><label>{{ p('quality') }} · {{ Math.round(profile.rules.quality * 100) }}%<input v-model.number="profile.rules.quality" type="range" min="0.6" max="1" step="0.01"></label></div><p class="field-hint">{{ p('qualityHint') }}</p>
      </fieldset>
      <fieldset :disabled="busy"><legend>{{ p('data') }}</legend>
        <label>{{ p('metadata') }}<select :aria-label="p('metadata')" v-model="profile.rules.metadata" @change="metadataChanged"><option value="selected">{{ p('selected') }}</option><option value="all">{{ p('all') }}</option><option value="none">{{ p('none') }}</option></select></label>
        <div v-if="profile.rules.metadata === 'selected'" class="profile-checks"><label><input v-model="profile.rules.keepDate" type="checkbox">{{ p('date') }}</label><label><input v-model="profile.rules.keepCamera" type="checkbox">{{ p('camera') }}</label></div>
        <p class="field-hint">{{ p('metadataHint') }}</p><p v-if="profile.rules.metadata === 'all'" class="field-hint">{{ p('allHint') }}</p>
        <label>{{ p('location') }}<select :aria-label="p('location')" v-model="profile.rules.location" :disabled="profile.rules.metadata === 'none'"><option value="off" :disabled="profile.rules.metadata === 'all'">{{ p('off') }}</option><option value="optional">{{ p('optional') }}</option><option value="required">{{ p('required') }}</option></select></label>
        <div v-if="profile.rules.location !== 'off'" class="profile-fields"><label>{{ p('accuracy') }}<input v-model.number="profile.rules.accuracy" required type="number" min="1" max="1000"></label><label>{{ p('window') }}<input v-model.number="profile.rules.locationWindow" required type="number" min="1" max="60"></label></div><p class="field-hint">{{ p('locationHint') }}</p>
      </fieldset>
      <fieldset :disabled="busy"><legend>{{ p('requirements') }}</legend>
        <label>{{ p('categories') }}<textarea v-model="categories" rows="3" maxlength="2430" /></label><div class="profile-checks"><label><input v-model="profile.rules.categoryRequired" type="checkbox">{{ p('categoryRequired') }}</label><label><input v-model="profile.rules.descriptionRequired" type="checkbox">{{ p('noteRequired') }}</label></div>
        <label>{{ p('shotList') }}<textarea v-model="shots" rows="3" maxlength="2430" /></label>
      </fieldset>
      <fieldset :disabled="busy"><legend>{{ p('changes') }}</legend><div class="profile-checks"><label><input v-model="profile.rules.descriptionEditable" type="checkbox">{{ p('editable') }}</label></div><p class="field-hint">{{ p('editableHint') }}</p></fieldset>
      <fieldset :disabled="busy"><legend>{{ p('id') }}</legend><label>{{ p('prefix') }}<input v-model="profile.rules.idPrefix" maxlength="8" pattern="[A-Za-z0-9]*" autocapitalize="characters"></label><p class="field-hint">{{ p('prefixHint') }}</p></fieldset>
      <div class="profile-save-bar"><RouterLink to="/profiles" class="quiet-button">{{ p('back') }}</RouterLink><button class="primary-button" type="submit" :disabled="busy">{{ p(busy ? 'saving' : 'save') }}</button></div>
    </form>
    <p v-if="error" class="server-warning" role="alert">{{ p(error) }}</p>
  </section>
</template>
