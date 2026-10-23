<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  account,
  loadIdentity,
  identityUnavailable,
  logout,
  profileSaved,
  sessionNotice,
  signingOut,
} from '../identity/store'
import { a } from '../identity/text'
import WorkspaceImport from '../components/WorkspaceImport.vue'
import AppIcon from '../components/AppIcon.vue'
import ScreenHeader from '../components/ScreenHeader.vue'
import AppSheet from '../components/AppSheet.vue'
import { q } from '../crypto/text'
import { accountKey } from '../identity/vault'
import { downloadFile } from '../studio/export'
import { purgeAccountFromDevice, pendingDeviceCleanup as cleanupPending, accountDeletionNotice as deletionNotice } from '../identity/storage'
import { photos } from '../local/library'
import { delivery } from '../delivery/queue'
import {
  dockPaths,
  preferencesSaved,
  setStartup,
  setTheme,
  startup,
  theme,
  type Startup,
  type Theme,
} from '../app/preferences'
import { u } from '../app/text'
import { s } from '../studio/text'
const router = useRouter(),
  authBusy = ref(false),
  authError = ref(''),
  copied = ref(false)
const logoutOpen = ref(false)
watch(() => account.value?.id, id => {
  if (id) { deletionNotice.value = false; localStorage.removeItem('pb-account-deletion-notice') }
}, { immediate: true })
async function retryCleanup() {
  if (!cleanupPending.value || authBusy.value) return
  authBusy.value = true; authError.value = ''
  try { await purgeAccountFromDevice(cleanupPending.value); localStorage.removeItem('pb-deleted-account-cleanup'); cleanupPending.value = null }
  catch { authError.value = q('Не удалось завершить очистку. Закройте другие окна приложения и повторите.') }
  finally { authBusy.value = false }
}
async function saveKey() {
  try {
    const key = await accountKey()
    if (!key) throw new Error('recovery.key_required')
    downloadFile(new File([key], 'photobunker-account-key.txt', { type: 'text/plain' }))
  } catch { authError.value = a('failed') }
}
onMounted(() => {
  void loadIdentity(true)
})
async function signOut() {
  authBusy.value = true
  try {
    await logout()
    logoutOpen.value = false
  } catch {
    authError.value = a('failed')
  } finally {
    authBusy.value = false
  }
}
async function copyId() {
  try {
    await navigator.clipboard.writeText(account.value!.publicId)
    copied.value = true
  } catch {
    authError.value = a('failed')
  }
}
const sections = [
  'assignments',
  'messages',
  'camera',
  'photos',
  'profile',
] as const
</script>

<template>
  <section class="native-screen account-screen">
    <ScreenHeader :title="u('profile')" />
    <div class="screen-body">
      <section class="account-card">
        <span class="account-avatar"><AppIcon name="user" /></span>
        <div v-if="account">
          <h2>
            {{ account.fields.name || account.fields.username || a('account') }}
          </h2>
          <p class="identity-public-id">{{ account.publicId }}</p>
          <div class="inline-actions">
            <button class="quiet-button" @click="copyId">
              {{ a(copied ? 'copied' : 'copy') }}</button
            ><button class="quiet-button" @click="router.push('/profile/edit')">
              {{ a('editProfile') }}
            </button>
          </div>
        </div>
        <div v-else>
          <h2>{{ a('noAccount') }}</h2>
          <p>{{ a('accountHint') }}</p>
        </div>
      </section>
      <p v-if="profileSaved && account" class="form-notice" role="status">
        {{ a('profileSaved') }}
      </p>
      <p v-if="signingOut" class="field-hint" role="status">Завершаем выход на устройстве…</p>
      <p v-if="sessionNotice && !account" class="form-error" role="alert">
        {{ a('sessionExpired') }}
      </p>
      <dl v-if="account" class="native-facts account-fields">
        <template
          v-for="field in [
            'username',
            'email',
            'phone',
            'links',
            'about',
          ] as const"
          :key="field"
          ><div v-if="account.fields[field]">
            <dt>{{ a(field) }} · {{ a(account.visibility[field]) }}</dt>
            <dd>{{ account.fields[field] }}</dd>
          </div></template
        >
      </dl>
      <p v-if="identityUnavailable" class="form-error" role="status">
        {{ a('unavailable') }}
        <button class="quiet-button" @click="loadIdentity(true)">
          {{ s('restore') }}
        </button>
      </p>
      <div v-if="!account" class="identity-entry-actions">
        <button class="primary-button" :disabled="signingOut" @click="router.push('/profile/account')">
          {{ a('create') }}</button
        ><button
          class="secondary-button"
          :disabled="signingOut"
          @click="router.push('/profile/account?mode=recover')"
        >
          {{ a('signInKey') }}</button>

      </div>
      <p v-if="!account && deletionNotice" class="field-hint" role="status">{{ q('Аккаунт закрыт. Очистка данных на сервере выполняется автоматически.') }}</p>
      <div v-if="!account && cleanupPending" class="form-error" role="alert"><p>{{ q('Закройте другие окна приложения, чтобы завершить удаление локальных данных.') }}</p><button class="secondary-button" :disabled="authBusy" @click="retryCleanup">{{ q('Завершить очистку устройства') }}</button></div>
      <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
      <template v-if="account">
      <div class="account-stats">
        <div>
          <strong>{{ photos.length }}</strong
          ><span>{{ u('personalPhotos') }}</span>
        </div>
        <div>
          <strong>{{ delivery.pending }}</strong
          ><span>{{ u('queued') }}</span>
        </div>
      </div>
      <section class="preference-group" :aria-label="u('preferences')">
        <h2>{{ u('preferences') }}</h2>
        <label class="preference-row"
          ><span><AppIcon name="appearance" />{{ u('appearance') }}</span
          ><select
            :aria-label="u('appearance')"
            :value="theme"
            @change="
              ($event) => {
                setTheme(($event.target as HTMLSelectElement).value as Theme)
              }
            "
          >
            <option value="dark">{{ u('dark') }}</option>
            <option value="light">{{ u('light') }}</option>
            <option value="system">{{ u('system') }}</option>
          </select></label
        >
        <label class="preference-row"
          ><span><AppIcon name="device" />{{ u('startup') }}</span
          ><select
            :aria-label="u('startup')"
            :value="startup"
            @change="
              ($event) => {
                setStartup(
                  ($event.target as HTMLSelectElement).value as Startup,
                )
              }
            "
          >
            <option
              v-for="(path, index) in dockPaths"
              :key="path"
              :value="path"
            >
              {{ u(sections[index]!) }}
            </option>
            <option value="last">{{ u('last') }}</option>
          </select></label
        >
        <p v-if="!preferencesSaved" class="preference-notice" role="status">
          {{ u('saveFailed') }}
        </p>
        <RouterLink v-if="account" to="/profile/contacts" class="account-link"
          ><AppIcon name="users" /><span
            ><strong>{{ a('contacts') }}</strong></span
          ><AppIcon name="chevron"
        /></RouterLink>
        <RouterLink v-if="account" to="/profile/security" class="account-link"
          ><AppIcon name="lock" /><span
            ><strong>{{ a('security') }}</strong
            ><small>{{ a('devices') }} · {{ a('infrastructure') }}</small></span
          ><AppIcon name="chevron"
        /></RouterLink>
        <RouterLink to="/settings" class="account-link"
          ><AppIcon name="settings" /><span
            ><strong>{{ u('settings') }}</strong
            ><small>{{ u('settingsHint') }}</small></span
          ><AppIcon name="chevron"
        /></RouterLink>
        <RouterLink to="/settings/data" class="account-link"><AppIcon name="device" /><span><strong>{{ q('Данные и хранилище') }}</strong><small>{{ q('Фотографии, занятое место и удаление аккаунта') }}</small></span><AppIcon name="chevron" /></RouterLink>
        <RouterLink to="/profile/teams" class="account-link"
          ><AppIcon name="users" /><span
            ><strong>{{ s('teams') }}</strong
            ><small>{{ s('participants') }}</small></span
          ><AppIcon name="chevron"
        /></RouterLink>
      </section>
      <WorkspaceImport v-if="account" />
      <p v-if="account" class="field-hint">{{ a('signOutHint') }}</p>
      <button
        v-if="account"
        class="quiet-button subtle-danger"
        :disabled="authBusy || signingOut"
        @click="logoutOpen = true"
      >
        {{ a('signOut') }}
      </button>
      </template>
    </div>
    <AppSheet :open="logoutOpen" :title="q('Выйти из аккаунта?')" :busy="authBusy || signingOut" @close="logoutOpen = false">
      <div class="logout-sheet-body">
        <div class="logout-sheet-copy">
          <p>{{ q('Ключ аккаунта будет удалён с этого устройства. Чтобы снова открыть фотографии и сообщения, понадобится сохранённый ключ.') }}</p>
          <p class="logout-sheet-warning">{{ q('Потерянный ключ восстановить нельзя.') }}</p>
          <p v-if="delivery.pending" class="field-hint">{{ q('Сначала дождитесь отправки фотографий с этого устройства.') }}</p>
        </div>
        <div class="logout-sheet-actions">
          <button class="primary-button full-button" :disabled="authBusy" @click="logoutOpen = false">{{ q('Остаться в аккаунте') }}</button>
          <button class="secondary-button full-button" :disabled="authBusy" @click="saveKey">{{ q('Сохранить ключ в файл') }}</button>
          <button class="danger-button full-button logout-sheet-danger" :disabled="authBusy || signingOut" @click="signOut">{{ q('Выйти без сохранения') }}</button>
        </div>
        <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
      </div>
    </AppSheet>
  </section>
</template>
