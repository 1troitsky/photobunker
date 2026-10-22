/**
 * Chat entry is a user intent, not an incidental combination of reactive flags.
 * Do not create Matrix rooms until crypto bootstrap and trust are confirmed.
 * An unverified device must be offered an explicit recovery action, rather
 * than silently ignoring "Message" or exposing an apparently endless spinner.
 */
export type ChatEntryDecision =
  | { kind: 'ready' }
  | { kind: 'recover' }
  | { kind: 'waiting' }
  | { kind: 'unavailable'; reason: 'offline' | 'otherTab' | 'unsupported' | 'error' }

export function decideChatEntry(connection: string, diagnostic: string, verified: boolean): ChatEntryDecision {
  if (connection === 'ready') {
    if (diagnostic !== 'ready') return { kind: 'waiting' }
    return verified ? { kind: 'ready' } : { kind: 'recover' }
  }
  if (connection === 'offline' || connection === 'otherTab' || connection === 'unsupported')
    return { kind: 'unavailable', reason: connection }
  if (connection === 'error') return { kind: 'unavailable', reason: 'error' }
  return { kind: 'waiting' }
}
