import { ref } from 'vue'
import { identityRequest, IdentityError, bindIdentity } from './api'
import {
  credentials,
  forgetCredentials,
  newDevice,
  parseKit,
  prove,
  saveCredential,
  type DeviceCredential,
} from './keys'
export type ProfileField =
  | 'name'
  | 'username'
  | 'email'
  | 'phone'
  | 'links'
  | 'about'
export type Account = {
  id: string
  publicId: string
  rootKey?: string
  username?: string | null
  fields: Record<ProfileField, string>
  visibility: Record<ProfileField, 'private' | 'contacts' | 'public'>
  revision: number
  matrix: { state: 'pending' | 'ready'; userId: string | null }
}
type Session = { account: Account; deviceId: string; expiresAt: number | null }
export type Person = {
  publicId: string
  username?: string | null
  fields: Partial<Record<ProfileField, string>>
  self: boolean
  blocked?: boolean
  relationship: null | {
    id: string
    state: 'pending' | 'accepted' | 'rejected' | 'removed'
    incoming: boolean
  }
}
export const account = ref<Account>(),
  identityReady = ref(false),
  identityUnavailable = ref(false),
  offlineCaptureIdentity = ref(false),
  publicCaptureUnknown = ref(false),
  deviceId = ref(''),
  localDevices = ref<DeviceCredential[]>([]),
  sessionNotice = ref(false),
  profileSaved = ref(false),
  signingOut = ref(false)
let loading: Promise<void> | undefined,
  generation = 0
const channel =
  typeof window !== 'undefined' && typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('photobunker-identity-v1')
    : undefined
if (typeof window !== 'undefined')
  window.addEventListener('photobunker-identity-expired', () => {
    void loadIdentity(true)
  })

function changed() {
  window.dispatchEvent(new Event('photobunker-identity'))
}
function clear(invalidate = true) {
  profileSaved.value = false
  if (invalidate) generation++
  account.value = undefined
  offlineCaptureIdentity.value = false
  publicCaptureUnknown.value = false
  void import('../crypto/database')
    .then((db) => db.remove('capture-current'))
    .catch(() => {})
  deviceId.value = ''
  bindIdentity('')
  changed()
}
channel?.addEventListener('message', () => {
  const used = identityReady.value
  clear()
  identityReady.value = false
  if (used) void loadIdentity(true)
})
function provisionMatrix() {
  void identityRequest('/matrix/provision', 'POST')
    .then(() => loadIdentity(true))
    .catch(() => {})
}
function accept(value: Session) {
  localStorage.setItem('pb-active-device', value.deviceId)
  offlineCaptureIdentity.value = false
  void import('../crypto/database')
    .then((db) =>
      db.put('capture-current', {
        accountId: value.account.id,
        publicId: value.account.publicId,
        deviceId: value.deviceId,
      }),
    )
    .catch(() => {})
  account.value = value.account
  deviceId.value = value.deviceId
  bindIdentity(value.account.id)
  identityReady.value = true
  identityUnavailable.value = false
  changed()
}
let forgetting: Promise<void> | undefined
async function forgetLocalAccountAccess() {
  if (forgetting) return forgetting
  forgetting = (async () => {
    await forgetCredentials()
    ;(await import('../server/api')).forgetLegacyLibraryAccess()
    const db = await import('../crypto/database')
    const keys = await db.entries('account-key:'), photos = await db.entries('trusted:')
    await Promise.all([...keys, ...photos].map(row => db.remove(row.key)))
    await (await import('../messages/keys')).forgetMessageStorage()
    localDevices.value = []
  })().finally(() => { forgetting = undefined })
  return forgetting
}
export function loadIdentity(force = false) {
  if (localStorage.getItem('pb-signed-out') === 'true') {
    account.value = undefined
    localDevices.value = []
    return forgetLocalAccountAccess().finally(() => { identityReady.value = true })
  }
  if (loading) return loading
  if (identityReady.value && !force) return Promise.resolve()
  const current = generation
  loading = (async () => {
    try {
      const result = await identityRequest<Session>('/me')
      if (current === generation) accept(result)
    } catch (error) {
      if (current === generation) {
        if (error instanceof IdentityError && error.status === 401) {
          const devices = await credentials().catch(() => [])
          const active =
            localStorage.getItem('pb-active-device') ??
            (
              await (await import('../crypto/database'))
                .get<{ deviceId: string }>('capture-current')
                .catch(() => undefined)
            )?.deviceId
          const device = devices.find((d) => d.id === active)
          if (device && current === generation) {
            try {
              const restored = await prove<Session>(
                {
                  purpose: 'login',
                  publicId: device.publicId,
                  deviceId: device.id,
                  name: device.name,
                },
                device.privateKey,
              )
              if (current === generation) {
                accept(restored)
                sessionNotice.value = false
                window.dispatchEvent(new Event('photobunker-identity-restored'))
                return
              }
            } catch (failure) {
              if (
                !(failure instanceof IdentityError) ||
                ![401, 403, 409, 410].includes(failure.status)
              ) {
                identityUnavailable.value = true
                return
              }
            }
          }
          localStorage.removeItem('pb-active-device')

          const remembered = await (await import('../crypto/database'))
            .get('capture-current')
            .catch(() => undefined)
          if (current !== generation) return
          const expired = !!remembered || sessionNotice.value
          clear(false)
          publicCaptureUnknown.value = expired
          sessionNotice.value = expired
          identityUnavailable.value = false
        } else if (error instanceof IdentityError && error.status === 410) {
          clear(); localStorage.setItem('pb-signed-out', 'true')
          await forgetLocalAccountAccess()
          sessionNotice.value = true; identityUnavailable.value = false
        } else identityUnavailable.value = true
      }
    } finally {
      identityReady.value = true
      localDevices.value = await credentials().catch(() => [])
      loading = undefined
      if (current !== generation) void loadIdentity(true)
    }
  })()
  return loading
}
function authenticated(result: Session) {
  localStorage.removeItem('pb-signed-out')
  profileSaved.value = false
  sessionNotice.value = false
  generation++
  accept(result)
  channel?.postMessage('changed')
}
export async function register(
  root: { privateKey: CryptoKey; publicKey: string },
  name: string,
) {
  const device = await newDevice(name)
  await saveCredential(device)
  const result = await prove<Session>(
    {
      purpose: 'register',
      rootKey: root.publicKey,
      deviceId: device.id,
      deviceKey: device.publicKey,
      name: device.name,
    },
    root.privateKey,
  )
  device.publicId = result.account.publicId
  await saveCredential(device)
  authenticated(result)
  provisionMatrix()
}
export async function recover(kit: string, name: string) {
  const root = await parseKit(kit),
    device = await newDevice(name)
  await saveCredential(device)
  const result = await prove<Session>(
    {
      purpose: 'recover',
      rootKey: root.publicKey,
      deviceId: device.id,
      deviceKey: device.publicKey,
      name: device.name,
    },
    root.privateKey,
  )
  device.publicId = result.account.publicId
  await saveCredential(device)
  authenticated(result)
  provisionMatrix()
}
export async function login(device: DeviceCredential) {
  authenticated(
    await prove<Session>(
      {
        purpose: 'login',
        publicId: device.publicId,
        deviceId: device.id,
        name: device.name,
      },
      device.privateKey,
    ),
  )
}
export async function logout() {
  signingOut.value=true
  const previousAccount = account.value?.id,
    previousDevice = deviceId.value
  localStorage.setItem(
    'pb-trust-revoked:' + `trusted:${previousAccount}:${previousDevice}`,
    'true',
  )
  localStorage.setItem('pb-signed-out', 'true')
  localStorage.removeItem('pb-active-device')
  localDevices.value = []
  clear()
  const messaging = await import('../messages/store')
  messaging.stopMessaging()
  const photoSecurity = await import('../crypto/store')
  photoSecurity.hardLock()
  sessionNotice.value = false
  publicCaptureUnknown.value = false
  channel?.postMessage('changed')
  try {
    await identityRequest('/session', 'DELETE', undefined, previousAccount)
  } finally {
    const db = await import('../crypto/database')
    await db.remove('capture-current').catch(() => {})
    await db
      .remove(`trusted:${previousAccount}:${previousDevice}`)
      .catch(() => {})
    await forgetLocalAccountAccess()
    localDevices.value = []
    signingOut.value=false
  }
}

export async function saveProfile(value: Account) {
  const result = await identityRequest<Account>('/profile', 'PATCH', {
    accountId: value.id,
    revision: value.revision,
    fields: value.fields,
    visibility: value.visibility,
  })
  if (account.value?.id === result.id) {
    generation++
    account.value = result
    profileSaved.value = true
  }
}
export async function connectMatrix() {
  return identityRequest<{
    userId: string
    deviceId: string
    accessToken: string
    baseUrl: string
  }>('/matrix/session', 'POST')
}

// Restoring a public capture identity grants no login or photo-read capability.
// Every later upload is checked against the live Identity session and epoch.
export async function restorePublicCaptureIdentity() {
  if(localStorage.getItem('pb-signed-out')==='true')return
  if (account.value || !identityUnavailable.value) return
  publicCaptureUnknown.value = true
  const saved = await (
    await import('../crypto/database')
  ).get<{ accountId: string; publicId: string; deviceId: string }>(
    'capture-current',
  )
  if (!saved) {
    publicCaptureUnknown.value = localDevices.value.length > 0
    return
  }
  const known = (await credentials()).find(
    (d) =>
      d.id === saved.deviceId &&
      d.publicId === saved.publicId &&
      !d.privateKey.extractable,
  )
  if (!known || account.value || !identityUnavailable.value) return
  const fields = Object.fromEntries(
      ['name', 'username', 'email', 'phone', 'links', 'about'].map((k) => [
        k,
        '',
      ]),
    ) as Account['fields'],
    visibility = Object.fromEntries(
      Object.keys(fields).map((k) => [k, 'private']),
    ) as Account['visibility']
  account.value = {
    id: saved.accountId,
    publicId: saved.publicId,
    fields,
    visibility,
    revision: 0,
    matrix: { state: 'pending', userId: null },
  }
  deviceId.value = saved.deviceId
  offlineCaptureIdentity.value = true
  bindIdentity(saved.accountId)
  changed()
}
if (typeof window !== 'undefined')
  window.addEventListener('online', () => {
    if (offlineCaptureIdentity.value) void loadIdentity(true)
  })
