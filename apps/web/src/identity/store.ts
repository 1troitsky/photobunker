import { ref } from 'vue'
import { identityRequest, IdentityError, bindIdentity } from './api'
import {
  credentials,
  forgetCredentials,
  automaticDeviceName,
  onboardingDevice,
  completeOnboardingDevice,
  reconcileOnboardingDevice,
  parseKit,
  prove,
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
export type SessionState =
  | 'initial' | 'checking' | 'authenticated' | 'offline'
  | 'signed-out' | 'unavailable' | 'revoked'

export const account = ref<Account>(),
  sessionState = ref<SessionState>('initial'),
  identityReady = ref(false),
  identityUnavailable = ref(false),
  offlineCaptureIdentity = ref(false),
  publicCaptureUnknown = ref(false),
  deviceId = ref(''),
  localDevices = ref<DeviceCredential[]>([]),
  sessionNotice = ref(false),
  profileSaved = ref(false),
  signingOut = ref(false)

let loading: Promise<void> | undefined
let generation = 0, refreshRequested = false, retryCount = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
const MAX_AUTOMATIC_RETRIES = 2
const channel =
  typeof window !== 'undefined' && typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('photobunker-identity-v1')
    : undefined

function changed() { window.dispatchEvent(new Event('photobunker-identity')) }
function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = undefined
}
function clear(invalidate = true, removeCapture = true) {
  profileSaved.value = false
  if (invalidate) generation++
  account.value = undefined
  offlineCaptureIdentity.value = false
  publicCaptureUnknown.value = false
  if (removeCapture)
    void import('../crypto/database').then(db => db.remove('capture-current')).catch(() => {})
  deviceId.value = ''
  bindIdentity('')
  changed()
}
function accept(value: Session) {
  if (account.value?.id !== value.account.id || deviceId.value !== value.deviceId)
    generation++
  localStorage.setItem('pb-active-device', value.deviceId)
  offlineCaptureIdentity.value = false
  account.value = value.account
  deviceId.value = value.deviceId
  bindIdentity(value.account.id)
  changed()
  // A scoped capture descriptor is not an authentication credential.
  const owner = value.account.id, device = value.deviceId, epoch = generation
  void import('../crypto/database')
    .then(async db => {
      if (epoch === generation && account.value?.id === owner && deviceId.value === device)
        await db.put('capture-current', { accountId: owner, publicId: value.account.publicId, deviceId: device })
    }).catch(() => {})
}
function markAuthenticated(value: Session) {
  cancelRetry()
  retryCount = 0
  sessionState.value = 'authenticated'
  identityReady.value = true
  identityUnavailable.value = false
  sessionNotice.value = false
  accept(value)
}
let forgetting: Promise<void> | undefined
async function forgetLocalAccountAccess() {
  if (forgetting) return forgetting
  forgetting = (async () => {
    await forgetCredentials()
    ;(await import('../server/api')).forgetLegacyLibraryAccess()
    const db = await import('../crypto/database')
    const keys = await db.entries('account-key:'), photos = await db.entries('trusted:'), imports = await db.entries('account-photo-import:')
    await Promise.all([...keys, ...photos, ...imports].map(row => db.remove(row.key)))
    await (await import('../messages/keys')).forgetMessageStorage()
    localDevices.value = []
  })().finally(() => { forgetting = undefined })
  return forgetting
}
async function knownDevice(): Promise<DeviceCredential | undefined> {
  const devices = await credentials()
  localDevices.value = devices
  const active = localStorage.getItem('pb-active-device') ??
    (await (await import('../crypto/database')).get<{ deviceId: string }>('capture-current'))?.deviceId
  return devices.find(d => d.id === active && !!d.publicId && !d.privateKey.extractable)
}
function scheduleRetry() {
  if (retryCount >= MAX_AUTOMATIC_RETRIES || !navigator.onLine ||
      localStorage.getItem('pb-signed-out') === 'true') return
  const index = retryCount++
  cancelRetry()
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    if (!signingOut.value && (sessionState.value === 'unavailable' || sessionState.value === 'offline'))
      void loadIdentity(true)
  }, Math.min(2000 * 2 ** index, 12000))
}
async function markTemporaryFailure(epoch: number) {
  if (epoch !== generation) return
  identityUnavailable.value = true
  try {
    const device = await knownDevice()
    if (epoch !== generation) return
    if (device && account.value?.id && deviceId.value === device.id) {
      offlineCaptureIdentity.value = true
      sessionState.value = 'offline'
    } else if (device && !account.value) {
      await restorePublicCaptureIdentity(true)
      if (epoch !== generation) return
      sessionState.value = offlineCaptureIdentity.value ? 'offline' : 'unavailable'
    } else sessionState.value = 'unavailable'
  } catch { if (epoch === generation) sessionState.value = 'unavailable' }
  if (epoch === generation) scheduleRetry()
}
async function permanentFailure(epoch: number, expired: boolean) {
  if (epoch !== generation) return
  cancelRetry()
  clear()
  sessionState.value = 'revoked'
  identityUnavailable.value = false
  sessionNotice.value = true
  identityReady.value = true
  const revocationEpoch = generation
  void import('../crypto/store').then(photo => {
    if (generation === revocationEpoch && sessionState.value === 'revoked') photo.hardLock()
  }).catch(() => {})
  void import('../messages/store').then(messages => {
    if (generation === revocationEpoch && sessionState.value === 'revoked') messages.stopMessaging()
  }).catch(() => {})
  if (expired) {
    localStorage.setItem('pb-signed-out', 'true')
    await forgetLocalAccountAccess()
  }
}
function handleBroadcast(event: MessageEvent<unknown>) {
  const message = event.data
  if (!message || typeof message !== 'object') return
  const { kind, accountId } = message as { kind?: unknown; accountId?: unknown }
  if (kind !== 'logout' && kind !== 'session') return
  // The cookie belongs to the browser origin, not an individual tab.
  // Another tab's logout also invalidates this tab's prior session.
  void accountId
  cancelRetry()
  clear()
  identityReady.value = false
  sessionState.value = 'checking'
  if (loading) refreshRequested = true
  else void loadIdentity(true)
}
channel?.addEventListener('message', handleBroadcast)
if (typeof window !== 'undefined') {
  window.addEventListener('photobunker-identity-expired', () => {
    if (sessionState.value === 'authenticated' && !signingOut.value && !loading)
      void loadIdentity(true)
  })
}

/** The app shell must not await network/bootstrap. */
export function startIdentityBootstrap() {
  if (sessionState.value !== 'initial') return
  // Speculative local context can permit capture but never authenticates API.
  void restorePublicCaptureIdentity(true).catch(() => {})
  void loadIdentity()
}
export function hasConfirmedIdentity() {
  return sessionState.value === 'authenticated' && !!account.value && !offlineCaptureIdentity.value
}
export function loadIdentity(force = false): Promise<void> {
  if (signingOut.value) return Promise.resolve()
  if (localStorage.getItem('pb-signed-out') === 'true') {
    if (sessionState.value === 'signed-out' && identityReady.value) return Promise.resolve()
    cancelRetry()
    clear()
    sessionState.value = 'signed-out'
    identityReady.value = true
    identityUnavailable.value = false
    return forgetLocalAccountAccess()
  }
  if (loading) {
    if (force) refreshRequested = true
    return loading
  }
  if (identityReady.value && !force) return Promise.resolve()
  const epoch = generation
  identityReady.value = false
  sessionState.value = 'checking'
  const job = (async () => {
    try {
      const result = await identityRequest<Session>('/me')
      if (epoch !== generation) return
      await reconcileOnboardingDevice(result.deviceId, result.account.publicId)
      if (epoch === generation) markAuthenticated(result)
    } catch (error) {
      if (epoch !== generation) return
      if (error instanceof IdentityError && error.status === 410) {
        await permanentFailure(epoch, true)
      } else if (error instanceof IdentityError && error.status === 401) {
        let device: DeviceCredential | undefined
        try { device = await knownDevice() }
        catch { await markTemporaryFailure(epoch); return }
        if (epoch !== generation) return
        if (!device) {
          clear()
          sessionState.value = 'signed-out'
          identityReady.value = true
          identityUnavailable.value = false
        } else {
          try {
            const session = await prove<Session>({
              purpose: 'login', publicId: device.publicId,
              deviceId: device.id, name: device.name,
            }, device.privateKey)
            if (epoch !== generation) return
            markAuthenticated(session)
            window.dispatchEvent(new Event('photobunker-identity-restored'))
          } catch (failure) {
            if (epoch !== generation) return
            if (failure instanceof IdentityError && failure.status === 410)
              await permanentFailure(epoch, true)
            else if (failure instanceof IdentityError && [401, 403, 409].includes(failure.status))
              await permanentFailure(epoch, false)
            else await markTemporaryFailure(epoch)
          }
        }
      } else {
        // A 403 Origin policy or 409 conflict is not proof that the account
        // was deleted; only verified device proof denial / 410 is terminal.
        await markTemporaryFailure(epoch)
      }
    } finally {
      if (epoch === generation) identityReady.value = true
      loading = undefined
      const queued = refreshRequested
      refreshRequested = false
      if (queued && !signingOut.value && localStorage.getItem('pb-signed-out') !== 'true')
        void loadIdentity(true)
    }
  })()
  loading = job
  return job
}

function authenticated(result: Session) {
  localStorage.removeItem('pb-signed-out')
  profileSaved.value = false
  sessionNotice.value = false
  generation++
  markAuthenticated(result)
  channel?.postMessage({ kind: 'session', accountId: result.account.id })
}
function assertLoginEpoch(epoch: number) {
  if (epoch !== generation || signingOut.value)
    throw new DOMException('Account changed during sign-in', 'AbortError')
}
export async function register(
  root: { privateKey: CryptoKey; publicKey: string },
  name = automaticDeviceName(),
) {
  const epoch = generation
  if (account.value?.rootKey === root.publicKey && deviceId.value) {
    assertLoginEpoch(epoch)
    return
  }
  const device = await onboardingDevice(root.publicKey, name)
  assertLoginEpoch(epoch)
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
  assertLoginEpoch(epoch)
  await completeOnboardingDevice(root.publicKey, device, result.account.publicId)
  assertLoginEpoch(epoch)
  authenticated(result)
}
export async function recover(kit: string, name = automaticDeviceName()) {
  const epoch = generation
  const root = await parseKit(kit)
  if (account.value?.rootKey === root.publicKey && deviceId.value) {
    assertLoginEpoch(epoch)
    return
  }
  const device = await onboardingDevice(root.publicKey, name)
  assertLoginEpoch(epoch)
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
  assertLoginEpoch(epoch)
  await completeOnboardingDevice(root.publicKey, device, result.account.publicId)
  assertLoginEpoch(epoch)
  authenticated(result)
}
export async function login(device: DeviceCredential) {
  const epoch = generation
  const result = await prove<Session>(
    {
      purpose: 'login',
      publicId: device.publicId,
      deviceId: device.id,
      name: device.name,
    },
    device.privateKey,
  )
  assertLoginEpoch(epoch)
  authenticated(result)
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
  cancelRetry()
  clear()
  sessionState.value = 'signed-out'
  identityReady.value = true
  identityUnavailable.value = false
  const messaging = await import('../messages/store')
  messaging.stopMessaging()
  const photoSecurity = await import('../crypto/store')
  photoSecurity.hardLock()
  sessionNotice.value = false
  publicCaptureUnknown.value = false
  channel?.postMessage({ kind: 'logout', accountId: previousAccount })
  try {
    await identityRequest('/session', 'DELETE', undefined, previousAccount)
  } finally {
    try {
      const db = await import('../crypto/database')
      const cleanup: Promise<unknown>[] = [
        db.remove('capture-current').catch(() => {}),
        forgetLocalAccountAccess(),
      ]
      if (previousAccount && previousDevice) {
        cleanup.push(db.remove(`trusted:${previousAccount}:${previousDevice}`).catch(() => {}))
        cleanup.push(import('../messages/durable-outbox')
          .then(outbox => outbox.eraseDurableOutbox(previousAccount, previousDevice)))
      }
      await Promise.all(cleanup)
    } finally {
      localDevices.value = []
      signingOut.value=false
    }
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
export async function restorePublicCaptureIdentity(warm = false) {
  if(localStorage.getItem('pb-signed-out')==='true')return
  if (account.value || !identityUnavailable.value && !warm) return
  const epoch = generation
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
  if (!known || account.value || epoch !== generation || !identityUnavailable.value && !warm) return
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
  // Local-only capture never binds an authenticated server account.
  changed()
}
if (typeof window !== 'undefined')
  window.addEventListener('online', () => {
    cancelRetry()
    retryCount = 0
    if (sessionState.value === 'offline' || sessionState.value === 'unavailable')
      void loadIdentity(true)
  })
