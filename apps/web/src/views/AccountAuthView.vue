<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import ScreenHeader from '../components/ScreenHeader.vue'
import { createRoot } from '../identity/keys'
import { account, register, recover, signingOut } from '../identity/store'
import { IdentityError } from '../identity/api'
import { rememberAccountKey, saveAccountSecrets } from '../identity/vault'
import { ensureAccountPhotos } from '../identity/setup'
import { rememberedKit } from '../crypto/trusted'
import { parseRecoveryBackup } from '../identity/recovery'
import { q } from '../crypto/text'
import { a } from '../identity/text'
import { s } from '../studio/text'
import { guardReload } from '../studio/unsaved'
import { downloadFile } from '../studio/export'
import { profileReturnTo } from '../identity/person'
import { ensureNewAccountMessaging } from '../identity/messaging-setup'
const route = useRoute(), router = useRouter(), busy = ref(false), error = ref(''),
  name = ref(a('deviceDefault')), kitSaved = ref(false), kit = ref(''), registered = ref(false)
const connecting = computed(() => route.query.mode === 'connect')
const recovering = computed(() => route.query.mode === 'recover' || connecting.value)
let root: Awaited<ReturnType<typeof createRoot>> | undefined, done = false, recoveredKey = ''
const dirty = computed(() => !!kit.value && !done)
guardReload(dirty, busy)
async function prepare() {
  busy.value = true; error.value = ''
  try { root = await createRoot(); kit.value = root.kit }
  catch { error.value = a('failed') }
  finally { busy.value = false }
}
async function submit() {
  if (busy.value || signingOut.value || !name.value.trim()) return
  busy.value = true; error.value = ''
  try {
    if (recovering.value) {
      const backup = parseRecoveryBackup(kit.value)
      let photoKey = backup.photoKey
      if (!connecting.value && recoveredKey !== backup.accountKey) {
        const oldAccount = account.value?.id, oldPhotoKey = await rememberedKit().catch(() => undefined)
        await recover(backup.accountKey, name.value)
        if (oldAccount === account.value?.id) photoKey ||= oldPhotoKey
        recoveredKey = backup.accountKey
      }
      await rememberAccountKey(backup.accountKey)
      if (photoKey) await saveAccountSecrets({ photoKey })
    } else {
      if (!root || !kitSaved.value) return
      if (!registered.value) { await register(root, name.value); registered.value = true }
      await rememberAccountKey(kit.value)
    }
    await ensureAccountPhotos()
    if (!recovering.value) await ensureNewAccountMessaging()
    done = true; kit.value = ''; root = undefined; recoveredKey = ''
    await router.replace(profileReturnTo(route.query.returnTo))
  } catch (failure) {
    const code = failure instanceof Error ? failure.message : ''
    error.value = code === 'onboarding.messaging_unavailable' ? q('Аккаунт создан, но не удалось подготовить сообщения. Проверьте соединение и повторите. Ключ аккаунта остаётся тем же.')
      : code === 'recovery.legacy_photo_key' ? q('Для старых фотографий нужна прежняя резервная копия. Импортируйте её один раз; новые ключи не создаются взамен существующих.')
      : code === 'recovery.wrong_account' ? q('Этот ключ принадлежит другому аккаунту. Выберите ключ текущего аккаунта.')
      : failure instanceof IdentityError && failure.status === 401 ? a('denied')
      : code.startsWith('identity.') || failure instanceof DOMException ? a('invalidKit') : a('failed')
  } finally { busy.value = false }
}
function saveKit() { downloadFile(new File([kit.value], 'photobunker-account-key.txt', { type: 'text/plain' })) }
async function importBackup(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  try {
    if (!file || file.size > 8192) throw new Error('invalid_backup')
    const value = await file.text(); parseRecoveryBackup(value); kit.value = value; error.value = ''
  } catch { error.value = a('invalidKit') }
  finally { input.value = '' }
}
onBeforeRouteLeave(() => done || !busy.value && (!dirty.value || confirm(s('leave'))))
onBeforeUnmount(() => { kit.value = ''; root = undefined; recoveredKey = '' })
</script>
<template>
  <section class="native-screen native-editor">
    <ScreenHeader :title="connecting ? q('Подключить ключ аккаунта') : a(recovering ? 'signInKey' : 'create')" back="/profile" />
    <form class="native-form editor-body" @submit.prevent="submit">
      <p class="field-hint">{{ recovering ? q('Введите единственный ключ аккаунта или выберите сохранённый файл. Приложение само подключит фотографии и переписку.') : q('Создайте аккаунт и сохраните один ключ. Он подключает фотографии и переписку на ваших устройствах.') }}</p>
      <label v-if="!connecting">{{ a('deviceName') }}<input v-model="name" maxlength="80" required autocomplete="off" /></label>
      <template v-if="recovering">
        <label>{{ a('kit') }}<textarea v-model="kit" rows="5" spellcheck="false" autocapitalize="off" autocomplete="off" /></label>
        <label>{{ q('Импортировать ключ аккаунта') }}<input type="file" accept=".txt,text/plain" :disabled="busy" @change="importBackup" /></label>
      </template>
      <template v-else>
        <button v-if="!kit" type="button" class="primary-button" :disabled="busy" @click="prepare">{{ a('create') }}</button>
        <template v-else>
          <p class="field-hint">{{ q('Ключ сохраняется на этом устройстве. Резервная копия позволит войти после выхода или потери устройства.') }}</p>
          <label>{{ a('kit') }}<textarea :value="kit" readonly rows="5" spellcheck="false" autocomplete="off" /></label>
          <button type="button" class="secondary-button" @click="saveKit">{{ a('downloadKit') }}</button>
          <label class="plain-check"><input v-model="kitSaved" type="checkbox" />{{ a('kitSaved') }}</label>
        </template>
      </template>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <footer class="editor-footer">
        <button type="button" class="secondary-button" :disabled="busy" @click="router.push('/profile')">{{ s('cancel') }}</button>
        <button class="primary-button" :disabled="busy || signingOut || !kit || (!recovering && !kitSaved)">{{ s(busy ? 'saving' : 'done') }}</button>
      </footer>
    </form>
  </section>
</template>
