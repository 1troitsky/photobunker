import { b64, unb64, canonical, hash, ready, uuid } from './protocol'
import type { PrivatePhotoCard } from '../studio/private-photo-card'

/** Separate V2 contract; the JPEG /s/:id V1 manifest is never upgraded. */
export type CardScopes = {
  card: true
  photo: boolean
  original: boolean
  download: boolean
  metadata: boolean
}
export const CARD_ONLY: CardScopes = {
  card: true, photo: false, original: false, download: false, metadata: false,
}
export type CardManifest = {
  type: 'photo-card'
  version: 2
  id: string
  scopes: CardScopes
  expiresAt: number
  durationSeconds: 3600 | 86400 | 604800
  object: { type: 'card'; version: 1; iv: string; ciphertextHash: string; ciphertextBytes: number }
}
export type PublicCard = {
  type: 'photo-card-payload'
  version: 1
  title: string
  namePending?: true
  description?: string
  expiresAt: number
  capturedAt?: number
  location?: { latitude: number; longitude: number }
  metadata?: PrivatePhotoCard['metadata']
  author?: { publicId: string }
}
const keys = ['card', 'photo', 'original', 'download', 'metadata'] as const
function scopesValid(input: unknown): input is CardScopes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const v = input as Record<string, unknown>
  if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return false
  if (v.card !== true || keys.some(k => typeof v[k] !== 'boolean')) return false
  if (v.download && !v.photo && !v.original) return false
  // Images require a redaction-certified renderer and distinct protected
  // object delivery, neither of which the existing JPEG exporter guarantees.
  return v.photo === false && v.original === false && v.download === false
}
export function validateCardScopes(input: unknown): asserts input is CardScopes {
  if (!scopesValid(input)) throw new Error('card_share.invalid_scopes')
}
function manifestValid(input: unknown): input is CardManifest {
  if (!input || typeof input !== 'object') return false
  const v = input as Partial<CardManifest>, o = v.object
  return v.type === 'photo-card' && v.version === 2 && uuid(v.id ?? '') &&
    scopesValid(v.scopes) &&
    Object.keys(v).sort().join(',') === ['type','version','id','scopes','expiresAt','durationSeconds','object'].sort().join(',') &&
    [3600, 86400, 604800].includes(v.durationSeconds ?? 0) &&
    Number.isSafeInteger(v.expiresAt) && (v.expiresAt ?? 0) > Date.now() &&
    !!o && Object.keys(o).sort().join(',') === ['type','version','iv','ciphertextHash','ciphertextBytes'].sort().join(',') &&
    o.type === 'card' && o.version === 1 &&
    typeof o.iv === 'string' && typeof o.ciphertextHash === 'string' &&
    typeof o.ciphertextBytes === 'number' && Number.isSafeInteger(o.ciphertextBytes) &&
    o.ciphertextBytes > 16 && o.ciphertextBytes <= 32784
}
const aad = (manifest: CardManifest) => new TextEncoder().encode(
  'photobunker/photo-card/v2\0' + canonical({
    type: manifest.type, version: manifest.version, id: manifest.id,
    scopes: manifest.scopes, expiresAt: manifest.expiresAt,
    durationSeconds: manifest.durationSeconds,
    object: { type: manifest.object.type, version: manifest.object.version },
  }),
)
export function publicCardPayload(card: PrivatePhotoCard, scopes: CardScopes, expiresAt: number): PublicCard {
  validateCardScopes(scopes)
  if (!card.expiresAt || expiresAt > card.expiresAt || expiresAt <= Date.now())
    throw new Error('card_share.expired')
  const title = (card.title || card.nameId || '').slice(0, 120)
  if (!title && !card.namePending) throw new Error('card_share.invalid_photo')
  // Only R1-03A's allowlisted card is accepted; no source Photo spreads.
  return {
    type: 'photo-card-payload', version: 1,
    title, ...(!title && card.namePending ? { namePending: true as const } : {}),
    ...(card.description ? { description: card.description.slice(0, 2000) } : {}),
    expiresAt,
    ...(scopes.metadata ? {
      ...(card.capturedAt ? { capturedAt: card.capturedAt } : {}),
      ...(card.location ? { location: { ...card.location } } : {}),
      ...(card.metadata ? { metadata: { ...card.metadata } } : {}),
      ...(card.author ? { author: { publicId: card.author.publicId } } : {}),
    } : {}),
  }
}
function payloadValid(x: unknown, scopes: CardScopes, expiry: number): x is PublicCard {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const v = x as Partial<PublicCard>
  const allowed = ['type', 'version', 'title', 'namePending', 'description', 'expiresAt',
    ...(scopes.metadata ? ['capturedAt', 'location', 'metadata', 'author'] : [])]
  if (Object.keys(v).some(k => !allowed.includes(k)) ||
      v.type !== 'photo-card-payload' || v.version !== 1 ||
      typeof v.title !== 'string' || v.title.length > 120 ||
      (v.namePending !== undefined && v.namePending !== true) ||
      (!v.title && v.namePending !== true) ||
      (v.description !== undefined && (typeof v.description !== 'string' || v.description.length > 2000)) ||
      v.expiresAt !== expiry) return false
  if (v.capturedAt !== undefined && (!Number.isSafeInteger(v.capturedAt) || v.capturedAt <= 0)) return false
  if (v.location && (typeof v.location !== 'object' ||
    Object.keys(v.location).sort().join(',') !== 'latitude,longitude' ||
    !Number.isFinite(v.location.latitude) || !Number.isFinite(v.location.longitude) ||
    Math.abs(v.location.latitude) > 90 || Math.abs(v.location.longitude) > 180)) return false
  if (v.author && (typeof v.author !== 'object' ||
    Object.keys(v.author).join(',') !== 'publicId' ||
    !/^[A-Za-z0-9_-]{2,128}$/.test(v.author.publicId))) return false
  if (v.metadata) {
    if (typeof v.metadata !== 'object' || Array.isArray(v.metadata) ||
        Object.keys(v.metadata).some(k =>
          !['date','time','camera','width','height','bytes','mime','method','accuracy','locationSource'].includes(k)))
      return false
    for (const k of ['date', 'time', 'camera', 'mime', 'method', 'locationSource'] as const)
      if (v.metadata[k] !== undefined && typeof v.metadata[k] !== 'string') return false
    for (const k of ['width', 'height', 'bytes', 'accuracy'] as const)
      if (v.metadata[k] !== undefined &&
          (typeof v.metadata[k] !== 'number' || !Number.isFinite(v.metadata[k]))) return false
  }
  return true
}
export async function encryptCard(card: PrivatePhotoCard, scopes: CardScopes, expiresAt: number,
  durationSeconds: 3600 | 86400 | 604800) {
  await ready()
  if (expiresAt > Date.now() + durationSeconds * 1000)
    throw new Error('card_share.invalid_duration')
  const payload = publicCardPayload(card, scopes, expiresAt)
  const plain = new TextEncoder().encode(JSON.stringify(payload))
  if (plain.byteLength > 32768) throw new Error('card_share.too_large')
  const keyMaterial = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12))
  const manifest: CardManifest = {
    type: 'photo-card', version: 2, id: crypto.randomUUID(), scopes,
    expiresAt, durationSeconds,
    object: { type: 'card', version: 1, iv: b64(iv), ciphertextHash: '', ciphertextBytes: 0 },
  }
  try {
    const key = await crypto.subtle.importKey('raw', keyMaterial, 'AES-GCM', false, ['encrypt'])
    const data = new Uint8Array(await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: aad(manifest) as Uint8Array<ArrayBuffer>,
      tagLength: 128,
    }, key, plain))
    manifest.object.ciphertextHash = hash(data)
    manifest.object.ciphertextBytes = data.length
    return { manifest, secret: b64(keyMaterial), ciphertext: new Blob([data]) }
  } finally { plain.fill(0); keyMaterial.fill(0) }
}
export async function decryptCard(blob: Blob, manifest: CardManifest, secret: string): Promise<PublicCard> {
  await ready()
  if (!manifestValid(manifest) || blob.size !== manifest.object.ciphertextBytes)
    throw new Error('card_share.invalid_manifest')
  const raw = unb64(secret, 32)
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (hash(bytes) !== manifest.object.ciphertextHash) throw new Error('card_share.tampered')
    const key = await crypto.subtle.importKey('raw', raw as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['decrypt'])
    const clear = new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: unb64(manifest.object.iv, 12) as Uint8Array<ArrayBuffer>,
      additionalData: aad(manifest) as Uint8Array<ArrayBuffer>, tagLength: 128,
    }, key, bytes))
    try {
      const payload: unknown = JSON.parse(new TextDecoder().decode(clear))
      if (!payloadValid(payload, manifest.scopes, manifest.expiresAt))
        throw new Error('card_share.invalid_payload')
      return payload
    } finally { clear.fill(0) }
  } finally { raw.fill(0) }
}
