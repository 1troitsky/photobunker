import { account, deviceId } from './store'
import { accountKey, readAccountSecrets, saveAccountSecrets, pendingImportedPhotoKey, clearImportedPhotoKey } from './vault'
import { rememberedKit } from '../crypto/trusted'
import { loadProtection, protectionEnabled, cryptoError, strongUnlocked, beginSetup, candidateKit, confirmSetup, unlock, prepareContext } from '../crypto/store'
let setup: { scope: string; promise: Promise<void> } | undefined
export function ensureAccountPhotos(): Promise<void> {
  const owner = account.value?.id, device = deviceId.value
  const scope = `${owner}:${device}`
  if (setup?.scope === scope) return setup.promise
  if (setup) return setup.promise.catch(() => {}).then(() => ensureAccountPhotos())
  const check = () => { if (!owner || account.value?.id !== owner || deviceId.value !== device) throw new Error('recovery.cancelled') }
  const promise = (async () => {
    const root = await accountKey()
    if (!root) throw new Error('recovery.key_required')
    check()
    await loadProtection()
    check()
    if (cryptoError.value) throw new Error('recovery.unavailable')
    const saved = await readAccountSecrets()
    check()
    if (protectionEnabled.value) {
      const imported = await pendingImportedPhotoKey()
      check()
      const photoKey = await rememberedKit() || saved?.photoKey || imported
      if (!photoKey) throw new Error('recovery.legacy_photo_key')
      if (!saved?.photoKey) await saveAccountSecrets({ photoKey })
      check()
      if (imported && saved?.photoKey || imported === photoKey) await clearImportedPhotoKey()
      check()
      if (!strongUnlocked.value) await unlock(photoKey)
    } else {
      if (!candidateKit.value) await beginSetup(root)
      check()
      await confirmSetup()
    }
    check()
    await prepareContext()
    check()
  })().finally(() => { if (setup?.scope === scope) setup = undefined })
  setup = { scope, promise }
  return promise
}
