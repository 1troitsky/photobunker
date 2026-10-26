/** Synchronous in-memory barrier: lets Identity reject stale async session
 * responses BEFORE they can restore A after the destructive intent commits.
 * This module deliberately imports no stores (avoids a bootstrap cycle).
 */
let active=true
export const emergencyBarrierActive=()=>active
export const beginEmergencyBarrier=()=>{active=true}
export const resetEmergencyBarrierForNormalBootstrap=()=>{active=false}
