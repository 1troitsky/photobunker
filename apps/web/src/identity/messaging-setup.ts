// Complete new-account onboarding before publishing an account as ready to receive messages.
// All private SDK material stays in the existing package protected by the one account key.
import { account, deviceId } from './store'
export async function ensureNewAccountMessaging() {
  const owner = account.value?.id, device = deviceId.value
  if (!owner || !device) throw new Error('onboarding.messaging_unavailable')
  const messaging = await import('../messages/store')
  try {
    await messaging.startMessaging()
    if (account.value?.id !== owner || deviceId.value !== device) throw new DOMException('Account changed', 'AbortError')
    if (messaging.connection.value !== 'ready' || !messaging.security.value.verified)
      throw new Error('onboarding.messaging_unavailable')
    await messaging.preserveMessageKeys()
  } finally {
    if (account.value?.id === owner && deviceId.value === device) messaging.stopMessaging()
  }
}
