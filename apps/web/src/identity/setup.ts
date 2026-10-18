import { account } from './store'
import { accountKey, readAccountSecrets, saveAccountSecrets } from './vault'
import { rememberedKit } from '../crypto/trusted'
import { loadProtection, protectionEnabled, cryptoError, strongUnlocked, beginSetup, candidateKit, confirmSetup, unlock, prepareContext } from '../crypto/store'
let setup: Promise<void> | undefined
export function ensureAccountPhotos(): Promise<void> {
  if (setup) return setup
  const owner = account.value?.id
  setup = (async () => {
    const root = await accountKey()
    if (!root) throw new Error('recovery.key_required')
    await loadProtection()
    if (!owner || owner !== account.value?.id) throw new Error('recovery.cancelled')
    if (cryptoError.value) throw new Error('recovery.unavailable')
    const saved = await readAccountSecrets()
    if (protectionEnabled.value) {
      const photoKey = await rememberedKit() || saved?.photoKey
      if (!photoKey) throw new Error('recovery.legacy_photo_key')
      if (!saved?.photoKey) await saveAccountSecrets({ photoKey })
      if (!strongUnlocked.value) await unlock(photoKey)
    } else {
      if (!candidateKit.value) await beginSetup(root)
      await confirmSetup()
    }
    await prepareContext()
  })().finally(() => { setup = undefined })
  return setup
}
