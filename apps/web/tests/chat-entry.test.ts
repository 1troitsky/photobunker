import { describe, expect, it } from 'vitest'
import { decideChatEntry } from '../src/messages/chat-entry'

describe('P0 / first-message chat entry state machine', () => {
  it('never tries to create a Matrix room before crypto and sync bootstrap finishes', () => {
    for (const stage of ['idle', 'session', 'sdk', 'storage', 'crypto', 'sync', 'peers', 'security']) {
      expect(decideChatEntry('ready', stage, true)).toEqual({ kind: 'waiting' })
    }
  })
  it('routes an unverified but otherwise ready device into key recovery instead of silently ignoring Message', () => {
    expect(decideChatEntry('ready', 'ready', false)).toEqual({ kind: 'recover' })
  })
  it('allows room opening only after actual verified Matrix readiness', () => {
    expect(decideChatEntry('ready', 'ready', true)).toEqual({ kind: 'ready' })
  })
  it('makes connection failures actionable and distinct from key recovery', () => {
    for (const reason of ['offline', 'otherTab', 'unsupported', 'error'] as const) {
      expect(decideChatEntry(reason, 'ready', false)).toEqual({ kind: 'unavailable', reason })
    }
    expect(decideChatEntry('connecting', 'sync', false)).toEqual({ kind: 'waiting' })
  })
})
