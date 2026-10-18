// Public server time, never a key or a read capability. Keep it through a warm
// lock so offline PIN unlock cannot roll back an already observed deadline.
let reference = 0,
  observed = 0
export function observe(serverTime: number) {
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0)
    throw new Error('crypto.clock_uncertain')
  reference = Math.max(reference ? trustedNow() : 0, serverTime)
  observed = performance.now()
}
export function trustedNow() {
  if (!reference) throw new Error('crypto.clock_uncertain')
  return Math.max(Date.now(), reference + performance.now() - observed)
}
