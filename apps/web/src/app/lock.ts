import { ref } from 'vue'
import { account, deviceId } from '../identity/store'
import * as db from '../crypto/database'
export const appLockReady = ref(false),
  appLockFailure = ref(false),
  appLocked = ref(false),
  appPinEnabled = ref(false)
type Record = { salt: string; digest: string; failures: number; until: number }
let current: Record | undefined
let loadEpoch = 0
const key = () => `app-pin:${account.value?.id}:${deviceId.value}`
async function digest(pin: string, salt: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(salt + ':' + pin),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}
export async function loadAppLock() {
  const epoch = ++loadEpoch, scope = key()
  appLockReady.value = false
  appLockFailure.value = false
  let value: Record | undefined
  try {
    value = account.value ? await db.get<Record>(scope) : undefined
  } catch {
    if (epoch !== loadEpoch || scope !== key()) return
    // Storage errors must never silently disable an existing PIN.
    current = undefined
    appPinEnabled.value = true
    appLocked.value = true
    appLockFailure.value = true
    appLockReady.value = true
    return
  }
  if (epoch !== loadEpoch || scope !== key()) return
  current = value
  appPinEnabled.value = !!value
  appLocked.value = !!value
  appLockReady.value = true
}
export async function setAppPin(pin: string) {
  const scope = key()
  if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(pin))
    throw new Error('PIN: 4, 6 или 8 цифр')
  const salt = crypto.randomUUID()
  current = { salt, digest: await digest(pin, salt), failures: 0, until: 0 }
  await db.put(scope, current)
  if (scope !== key()) throw new Error('Аккаунт изменился')
  appPinEnabled.value = true
}
export async function removeAppPin() {
  const scope = key()
  await db.remove(scope)
  if (scope !== key()) throw new Error('Аккаунт изменился')
  current = undefined
  appPinEnabled.value = false
  appLocked.value = false
}
export function lockApp() {
  if (appPinEnabled.value) appLocked.value = true
}
export async function unlockApp(pin: string) {
  const scope = key(),
    value = current
  if (appLockFailure.value) throw new Error('Не удалось проверить PIN')
  if (!value) return
  if (value.until > Date.now())
    throw new Error('Слишком много попыток. Подождите 30 секунд.')
  if ((await digest(pin, value.salt)) !== value.digest) {
    value.failures++
    if (value.failures >= 5) {
      value.until = Date.now() + 30000
      value.failures = 0
    }
    await db.put(scope, value)
    if (scope !== key()) throw new Error('Аккаунт изменился')
    throw new Error('Неверный PIN')
  }
  if (scope !== key()) throw new Error('Аккаунт изменился')
  value.failures = 0
  value.until = 0
  await db.put(scope, value)
  if (scope !== key()) throw new Error('Аккаунт изменился')
  appLocked.value = false
}
