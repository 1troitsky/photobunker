<script setup lang="ts">
import { ref } from 'vue'
import { appPinEnabled, setAppPin, removeAppPin, lockApp } from '../app/lock'
const appPin = ref(''),
  pinNotice = ref('')
async function savePin() {
  try {
    await setAppPin(appPin.value)
    appPin.value = ''
    pinNotice.value = 'PIN приложения установлен'
  } catch {
    pinNotice.value = 'Введите 4, 6 или 8 цифр'
  }
}

import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import ScreenHeader from '../components/ScreenHeader.vue'
import AppIcon from '../components/AppIcon.vue'
import { account, deviceId, loadIdentity } from '../identity/store'
import { identityRequest } from '../identity/api'
import { accessCode } from '../server/api'
import { a } from '../identity/text'
import { q } from '../crypto/text'
type Device = {
  id: string
  name: string
  revoked_at: string | null
  matrix_revoke_pending: boolean
  last_seen_at: string | null
}
const router = useRouter(),
  devices = ref<Device[]>([]),
  busy = ref(false),
  error = ref(''),
  proved = ref(false),
  matrixReady = ref<boolean>()
async function refresh() {
  devices.value = (
    await identityRequest<{ devices: Device[] }>('/devices')
  ).devices
  try {
    matrixReady.value = (
      await identityRequest<{ matrix: { ready: boolean } }>('/infrastructure')
    ).matrix.ready
  } catch {
    matrixReady.value = false
  }
}
onMounted(async () => {
  await loadIdentity(true)
  if (account.value)
    try {
      await refresh()
    } catch {
      error.value = a('failed')
    }
})
watch(
  () => account.value?.id,
  (id, previous) => {
    if (previous && id !== previous) {
      devices.value = []
      proved.value = false
      matrixReady.value = undefined
    }
    if (id && id !== previous)
      void refresh().catch(() => {
        error.value = a('failed')
      })
  },
)
async function revoke(id: string) {
  if (busy.value || !confirm(a('revokeQuestion'))) return
  busy.value = true
  error.value = ''
  try {
    await identityRequest(`/devices/${id}`, 'DELETE')
    if (id === deviceId.value) {
      await loadIdentity(true)
      await router.replace('/profile')
    } else await refresh()
  } catch {
    error.value = a('failed')
  } finally {
    busy.value = false
  }
}
async function claim() {
  busy.value = true
  try {
    await identityRequest('/legacy-proof', 'POST', {
      libraryCode: accessCode.value,
    })
    proved.value = true
  } catch {
    error.value = a('failed')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="native-screen">
    <ScreenHeader :title="a('security')" back="/profile" />
    <div class="screen-body">
      <template v-if="account"
        ><form class="native-form form-card" @submit.prevent="savePin">
          <h2>Блокировка приложения</h2>
          <p class="field-hint">
            Необязательный PIN закрывает всё приложение при запуске и
            сворачивании. Фотографии открываются автоматически на этом
            устройстве.
          </p>
          <label
            >Новый PIN приложения<input
              v-model="appPin"
              type="password"
              inputmode="numeric"
              autocomplete="new-password"
              maxlength="8"
              required /></label
          ><button class="secondary-button">
            {{ appPinEnabled ? 'Изменить PIN' : 'Включить PIN' }}</button
          ><button
            v-if="appPinEnabled"
            type="button"
            class="quiet-button"
            @click="removeAppPin"
          >
            Отключить PIN</button
          ><button
            v-if="appPinEnabled"
            type="button"
            class="quiet-button"
            @click="lockApp"
          >
            Заблокировать приложение
          </button>
          <p v-if="pinNotice" role="status">{{ pinNotice }}</p>
        </form>
        <button
          class="secondary-button"
          @click="router.push('/profile/photos-security')"
        >
          {{ q('Ключ аккаунта') }}
        </button>
        <p class="field-hint">{{ a('securityHint') }}</p>
        <h2 class="section-caption">{{ a('devices') }}</h2>
        <article
          v-for="device in devices"
          :key="device.id"
          class="identity-device form-card"
        >
          <AppIcon name="device" />
          <div>
            <strong>{{ device.name }}</strong
            ><small>{{
              device.revoked_at
                ? a('revoked')
                : device.id === deviceId
                  ? a('current')
                  : ''
            }}</small>
            <p v-if="device.matrix_revoke_pending" class="field-hint">
              {{ a('matrixPending') }}
            </p>
          </div>
          <button
            v-if="!device.revoked_at"
            class="app-icon-button subtle-danger"
            :aria-label="`${a('revoke')}: ${device.name}`"
            :disabled="busy"
            @click="revoke(device.id)"
          >
            <AppIcon name="close" />
          </button>
        </article>
        <h2 class="section-caption">{{ a('infrastructure') }}</h2>
        <p class="field-hint">
          {{ a(matrixReady ? 'matrixReady' : 'matrixWaiting') }}
        </p>
        <p class="field-hint">{{ a('kitScope') }}</p>
        <template v-if="accessCode"
          ><h2 class="section-caption">{{ a('legacy') }}</h2>
          <p class="field-hint">{{ a('legacyHint') }}</p>
          <button
            class="secondary-button"
            :disabled="busy || proved"
            @click="claim"
          >
            {{ a('proveLibrary') }}
          </button>
          <p v-if="proved" class="field-hint" role="status">
            {{ a('libraryProved') }}
          </p></template
        ></template
      >
      <p v-else class="field-hint">{{ a('noAccount') }}</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
