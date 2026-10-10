# System Architecture & API Contract (v1 proposed)
Статус: engineering specification. Routes are proposed canonical names; agent may refine before implementation if all invariants remain.

## 1. Shape
- Frontend: **Vue 3 + TypeScript + Vite**, installable PWA, native-feeling full viewport camera and adaptive Gallery/Editor. Service worker only app shell/offline queues; no plaintext files in SW cache.
- Backend: small maintainable API (Laravel is pragmatic option given project experience, not hard requirement), PostgreSQL, one delete/reconciliation worker using existing scheduler, no large distributed infrastructure mandatory.
- Storage adapter: S3-compatible encrypted objects; R2 initial option, replaceable. No Ente API/fork, no paid vendor photo or encryption SDK requirement.
- Crypto: browser-maintained audited libsodium/Web Crypto construction with interoperable schemas defined in 06. Local editing tool with app-owned version schema; Fabric.js can be used as rendering adapter, not authoritative DB format.
- Process model: API never decodes original/photo preview/EXIF/editor metadata. Any derived preview/output is created and encrypted on end user device. API may use HEAD/size/hash of **ciphertext**.

## 2. Boundaries and data flow
Capture in browser → attach encrypted (or encryptable) metadata → choose public Vault encrypt recipient key → encrypt image & sidecar → locally commit ciphertext in queue → API upload-init quota reservation + server TTL → direct PUT multipart to S3 → API finalize verifies encrypted object → server record ACTIVE → other authorized user reads encrypted records and decrypts locally.
Metadata update and edit versions = independently encrypted immutable payload + optimistic revision counter.
Sharing = capability/wrapped keys and short-lived authorized downloads.
Expiration = API access denial immediately + dedicated deletion worker.

## 3. Auth / account API proposal
POST /api/v1/accounts — register opaque public identity, proof-of-possession challenge.
POST /api/v1/auth/challenge + POST /api/v1/auth/session — signed nonce, scoped session, anti-replay.
GET/DELETE /api/v1/devices; POST /api/v1/devices/link — cryptographically authenticated trusted device pair.
POST /api/v1/recovery-bundles; GET ... — encrypted opaque recovery bundle; cannot give back secret.
All endpoints versioned, JSON schema validated, abuse rate limits. No email/phone mandatory.

## 4. Vault / collaborator APIs
POST/GET/PATCH /api/v1/vaults, GET /api/v1/vaults/{id}, DELETE ….
POST /api/v1/vaults/{id}/invitations; POST /api/v1/invitations/{token}/accept; DELETE /api/v1/vaults/{id}/members/{memberId}; GET /api/v1/vaults/{id}/members.
POST/GET /api/v1/vaults/{id}/profiles; PUT /api/v1/vaults/{id}/profiles/{id} creating a new version.
POST/GET /api/v1/vaults/{id}/assignments; PATCH /api/v1/assignments/{id}/review, or narrow explicit submission review endpoint.
Payload encrypted profile/notes cannot be server inspected; validate envelope schema, ciphertext byte max and version; server enforces grants based on visible role/scopes only.

## 5. Asset/upload APIs
POST /api/v1/vaults/{id}/uploads: payload = idempotency_key (random UUID), ciphertext_bytes, cipher_format/version, kind=original, desired_ttl_seconds, upload manifest hash; returns upload_id, expires_at, signed upload instructions, reservation expiry. No plaintext metadata payload.
POST /api/v1/uploads/{id}/complete: authenticated & idempotent. Validate HEAD/size/storage checksum, expiry, quota, ownership; return asset_id + CLOUD_CONFIRMED only when durable manifest committed. If already completed same idempotency key, return same result.
GET /api/v1/vaults/{id}/assets?cursor=opaque; GET /api/v1/assets/{id} contains only encrypted metadata references, encrypted previews, opaque status, server-visible expires_at.
POST /api/v1/assets/{id}/metadata-revisions; POST /api/v1/assets/{id}/versions — store authenticated ciphertext payload and parent_revision via expected_version precondition; conflict 409.
POST /api/v1/assets/{id}/download-ticket — return short-lived scope restricted signed GET, expiration <= asset TTL.
DELETE /api/v1/assets/{id} — immediate server access revoke/tombstone + async verified physical cleanup. Can poll delete state.
POST /api/v1/assets/{id}/share; DELETE /api/v1/shares/{id}; GET /api/v1/shares/{id}/metadata + short-lived file ticket, scoped.
POST /api/v1/billing/invoices; GET /api/v1/billing/invoices/{id}; GET /api/v1/entitlements.

## 6. API status & idempotency
200/201 success; 202 work queued; 400 invalid request; 401 unauthenticated; 403 not authorized; 404 unknown or hidden unauthorized resource; 409 conflict/expired key epoch; 410 expired/deleted (only reveal to authorized actor); 413 file too large; 422 invalid envelope/schema; 429 throttled; 507 or relevant domain code quota exceeded; 5xx retryable with Retry-After where possible.
Use machine-readable error envelope with code, user-safe message key, request_id (never user plaintext), retryable, context (remaining_bytes, expires_at when authorized). All client retries idempotent; optimistic concurrency for metadata/editor; cursor pagination.

## 7. Upload lifecycle semantics
Untrusted client cannot set server-visible expiry beyond entitlement; server is final authority. Upload initiated before expiry but finalized after expiry must fail and cleanup. No sidecar upload after asset is tombstoned. Server may infer byte count, upload/access time, membership/relationship, but never plaintext caption/location.
Direct-upload signed URLs issued only after auth/quota reservation, with minimal scope to specific object and short TTL; signed read tickets also bound to earliest asset/share expiry. Storage object key not a user name or meaningful path. Avoid leaking key fragment in referer, requests or logs.

## 8. Realtime & search
Live gallery via polling or SSE event with opaque changed IDs. No plaintext events. Gallery search/filter on client after decrypt of authorized encrypted metadata; possible encrypted local on-device index (encrypted at rest). No Meilisearch/search-server because confidentiality conflicts with plaintext indexing and product scope.

## 9. Infra and config
Single API service + Postgres + S3 adapter + scheduler/deletion worker; HTTPS reverse proxy. Config keys for: storage bucket, key lifetime, upload chunk, max file bytes, quotas, TTL plan templates, deletion cadence, content security policy, security alerts, CORS. Test with in-memory/local S3-compatible storage but production deployment should not require Docker.
Strong CI for browser/mobile real-device and crypto round trips. Data migrations need rollback/forward compatibility, no re-encryption server-side.
