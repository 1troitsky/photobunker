# Storage, Retention, Expiration & Deletion
Статус: обязательный контракт жизненного цикла.

## 1. Storage boundaries
S3-compatible blob store (Cloudflare R2 может быть первым провайдером) хранит исключительно ciphertext и технические случайные object keys. PostgreSQL хранит opaque IDs, quota counters, sizes, expires_at, states, wrapped encryption metadata, minimal billing/account links. Storage provider adapter supports PUT, GET, HEAD, DELETE, multipart, signed URLs, list/check and provider health; не привязывать продукт к нестандартным функциям одного cloud provider. No public buckets; no permanent presigned URLs.
Выделить scopes: permanent encrypted originals до TTL; encrypted thumbnails/edited versions/sidecars до того же TTL; incomplete uploads with short orphan TTL; local encrypted outbox until ack/expiry.

## 2. Lifetime policy
Free: максимум **14 суток на отдельную фотографию** (не «бесплатная вечная корзина»).
Low-cost paid: пример **3 календарных месяца** максимум.
Higher tiers: **12 месяцев и более**; точные цены/GB/периоды НЕ утверждены продуктом и должны быть конфигом.
Owner (если разрешено — Curator) может поставить индивидуальный более короткий TTL, включая **1 час**, день, 7 дней, конкретную дату/время, Vault default и assignment policy. Effective expiry = MIN(asset TTL, Vault policy max, plan entitlement ending, explicit deletion date, child parent expiry). Admin cannot secretly extend retention; extension by user cannot exceed valid paid period.
Сначала в UI явно выбрать семантику «через N от съёмки»; локальный TTL истекает и удаляет очередной кадр даже offline. Для облачного объекта source of truth — server expires_at; при delayed upload сервер учитывает время с capture и duration, но client clock is not trusted; никогда не обещать абсолютную точность часа от несинхронизированного устройства. Когда offline elapsed time exceeds TTL, НЕ загружать кадр позже. Показывать пользователю точное estimated/deadline expiry и clock caveat.
Для plan expiry не создавать скрытый бессрочный grace архив. Grace period / frozen read-only должен быть объявленной **отдельной** политикой, не нарушающей обещанного максимума. По умолчанию после оплаченного срока — expire, блок доступа и удаление; заранее предупреждать (без раскрытия имени/фото в уведомлениях).

## 3. State machine
- PENDING_UPLOAD / ACTIVE / EXPIRING / ACCESS_BLOCKED / DELETE_QUEUED / DELETING / DELETE_VERIFIED / DELETE_FAILED.
- Immediately at/after expires_at API refuses read, edit, share, sign-download, finalize new child versions; existing previously issued signed URLs should have very short expiry. For strict 1h promise signed URL expiry MUST be bounded by object expiry and configurable max TTL; signed direct object links can bypass API until they die.
- Server scheduler scans expired rows at frequent configurable cadence; marks tombstones transactionally; deletes every ciphertext original/preview/edit/sidecar/derived; verifies via HEAD/list or provider confirmation where available; retries idempotently with exponential backoff; reports failures internally without metadata leakage.
- Server-side cleanup should not rely exclusively on bucket lifecycle (provider may delay by ~24h or more). Lifecycle is defense-in-depth for orphans/multipart, not precise scheduler.
- Shared asset: TTL parent governs all derived versions/shares; expired share stops access to share even if parent still alive.
- Immediate delete: revoke API access first, enqueue physical deletion. Deletion of vault/account requires recursive walk of encrypted child objects and key envelopes, controlled concurrency, restartable cursor.
- Versioned/deleted storage objects: disable provider versioning where incompatible with deletion promise, purge non-current versions, lifecycle multipart leftovers, replication copies and CDN cached objects.

## 4. Backup and deletion honesty
Explicitly list replicas/backups and their maximal residual TTL; encrypted database backups may retain opaque records/envelopes for disaster recovery but must not revive expired objects; disaster restoration must rerun expiration/deletion sweep **before serving**. If backing up encrypted originals, define time-bound encrypted retention and automated backup expiry; no hidden permanent copy.
«Истёк срок» means not available via app immediately, physical delete asynchronously with published verification SLO. Do not claim exact-bit erasure on storage provider physical media. A previously downloaded copy cannot be revoked.
Deletion evidence logs contain IDs/status/time only; no photo data. Set measurable deletion target only after provider tests, never invent guaranteed milliseconds.

## 5. Quota and cost semantics
Track encrypted total bytes charged (originals + edits + thumbnails + metadata + temporary reserved upload); UI explain overhead and paid capacity. Quota reservations atomic, short-lived, released after timeout/failure; no double-count on retries and no undercount on parallel requests. Per-Vault quota allocation from account pool; shared vault paid by owner unless explicit transfer. Photo count alone not pricing unit.
Free anti-abuse: upload bandwidth and space limits, rate limits, no user identity data needed; user always has export before planned expiry (if online/unlocked).
Provide monthly cost telemetry as aggregate only; server must not inspect images. No plan may disable E2EE/privacy.

## 6. Atomic uploads
Initiate reserves quota+ID+expires_at; upload random ciphertext object key via presigned URL or controlled multipart; finalize verifies object size/hash, source authorization, asset manifest and TTL; commit visible record atomically; avoid orphan on crash. Retry finalize same idempotency key returns same asset. Recovery job collects stray objects, expired reservations, abandoned multipart. Reconciliation checks DB ↔ storage and quota consistency.
Storage outage means **LOCAL_COMMITTED** not cloud confirmed; retry safely.

## 7. Security operations
Application layer owns policy checks; object store IAM least privilege separate uploader/delete worker, no listing or data egress open to public. Backup/restore runbooks, restore drills, irreversible deletion testing. No provider-specific APIs as core business logic.
Reference: https://developers.cloudflare.com/r2/buckets/object-lifecycles/ (lifecycles not a real-time delete guarantee).
