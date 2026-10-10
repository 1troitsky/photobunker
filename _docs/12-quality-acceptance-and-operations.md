# Acceptance Criteria, Testing, Reliability & Operations
Статус: executable quality contract for AI agent / reviewer. Это **не roadmap**, а определение готовности.

## 1. User-facing critical acceptance
A. First open PWA → no mandatory email → can securely register/recover; capture-first after onboarding, user-configurable Home; camera can work before Gallery PIN without decrypting archive.
B. Default PIN on Gallery/Menu/Editor; options off / before camera; no sensitive thumbnail or decrypted frame leaks on lock; PIN isn't misrepresented as strong key protection.
C. Shutter responds without server/GPS waiting; no application shutter sound/vibration; no system-gallery save in supported camera flow. Platform-imposed sound/quality limits documented.
D. Photo capture causes atomic **encrypted local queue** or explicit save failure; while not cloud-confirmed, **visible warning** «Фото ещё не загружено в облако». Quick Exit gives honest neutral warning; after app reopen recover/retry.
E. GPS permission consent; watch starts with camera, photo captures without GPS; later position as encrypted sidecar, with measured_at and offset; **visible warning** on GPS pending/insufficient accuracy and when exiting too early. Location never falsely shown as exact-at-shutter if measured later.
F. All photos/previews/metadata/edit operations E2EE; admin cannot decrypt by using server DB/storage; no mandatory third-party content processing.
G. Later unlock Gallery, crop/draw/text/adjust/blur, undo/redo, save encrypted version; original untouched; simultaneous edits don't silently overwrite.
H. Personal Vault without curator and Shared Vault with upload-only contributor + curator review are both functional; unauthorized submitter can't read curator material.
I. Expiry: Free ≤14 days, lower tier ~3 months, premium ≥12mo as config; per-photo shorter TTL incl 1h. Access denied at expiry, automated deletion and retries verified, no resurrection after backup recovery.
J. Crypto topup is prepaid/no subscription, anonymous account doesn't require payment identity; exact prices still TBD. Quota enforced including concurrent uploads.
K. No App/Play Store needed for core PWA; works on mobile iOS Safari installed PWA, Android Chrome installed PWA, desktop browsers; graceful degradation, no false background-sync guarantees.

## 2. Test matrix
| Category | Required tests |
|---|---|
| Camera | first-launch permissions, deny, OS background, orientation, front/back, high-resolution, repeat shutter, silent app behavior, camera already occupied |
| Queue | network absent, server offline, process killed mid-encrypt/mid-upload/finalize, free space exhausted, quota rejected, storage eviction, idempotent retry, multipart orphan cleanup |
| GPS | pending at shutter, better location 6s later, high accuracy too late after movement, permission denied, approximate OS mode, 15s active window, close during pending, measured vs captured timestamp |
| Crypto | known vectors, tamper/ciphertext swap, wrong key, recovery, cross-device, capture-only no decrypt, revoked recipient, pin offline brute attack model, XSS/CSP checks |
| Editor | text draw shapes crop rotate filters undo, version conflict, expired original during edit, Cyrillic fonts, redaction-safe export, offline draft, large-image memory |
| Collaboration | user invites, upload-only capability, invite expiry, revoke link, role escalation denial, version key epoch, review states, TTL restriction |
| Expiration | one-hour expiry while offline, signed URL ≤ TTL, DB/API denial at deadline, child cascade, cleanup eventual verification, backup restore sweep |
| Billing | free quotas, overlapping topups, pending/reorg, over/under payment, wrong chain, cancellation, plan expiry and no resurrection |
| UX/accessibility | warnings independent, locked thumbnails hidden, quick exit, keyboard/screen reader controls, dark/light, safe area, 320px widths, translations |

## 3. Definition of Done
New behavior documented and implemented; API schema updated; client/server tests and error states covered; docs consistent; security review for crypto/permission/storage edits; run browser compatibility test on at least one iPhone Home Screen PWA and Android installed PWA with real devices before describing feature as reliable. Never mark upload green until server complete. Test restores and deletion; no untested production secrets. No hidden background service reliance.
Review signed URL, auth, CSP, origin security and dependency updates in every PR touching capture or crypto. Treat user content as encrypted opaque data in fixtures; avoid real personal photos in test suite.

## 4. Observability (privacy-preserving)
Metrics allowed: aggregated upload-success latency, queue failures, number of deletion pending failures, storage bytes, CPU/RAM, anonymous error codes; avoid account-level analytics except needed for user support with explicit consent. Logs: request IDs, opaque object ID where required for incident response, no lat/long, captions, raw filenames, token, recovery key, share secret, plaintext photo, full IP under default retention policy. Prefer short log retention and operator access audit.

## 5. Operations runbooks
Document: storage provider outage → queue stays local encrypted, retries when active; DB outage → no false success; crypto key compromise → invalidate sessions/rotate epochs/update client, communicate scope; accidental deletion/recovery → restore encrypted nonexpired data only, rerun TTL sweep before API starts; queued delete job failures → alert and retry; billing node outage → no duplicate entitlement; user lost recovery kit → cannot decrypt server-side. Monitor orphaned uploads and unfinished deletions.
Disaster-recovery drills with explicit RPO/RTO measured rather than fictional. Backup integrity check and restore-on-staging with synthetic ciphertext data; delete expired files again after restore.

## 6. Performance targets (non-guaranteed)
Camera launch as near instantaneous as browser permission/device permits; visual shutter response target <100ms on reference device; queue persistence progress clear; virtualized gallery; decode thumbnail only after unlock, limit memory; avoid high-res data URL/base64 expansion where possible. No automatic original FullHD downscale. Capture remains responsive during sync/GPS/edits. Measure cold start, median and tail latency, failed uploads, encrypted queue size, memory.
Browser compatibility is a test matrix not a promise: Safari iOS lacks dependable background sync; quota persistence depends browser; camera APIs vary.

## 7. Accessibility and safety
Explicit opt-in GPS; no stealth geolocation outside active capture; no attempts to circumvent camera indicator/forced shutter sound; neutral notifications on lock; user has clear exports and delete controls; malicious/shared link phishing protection and URL fragment handling; never present GPS as guaranteed proof of truth.

## 8. References
- https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API — limited browser availability.
- https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist — persistent storage may be denied.
- https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition — permission, HTTPS, continuous location.
- https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/accuracy — 95% confidence radius.
- https://www.w3.org/TR/geolocation/ — background/visibility constraints.
- https://developers.cloudflare.com/r2/buckets/object-lifecycles/ — provider expiry not exact-time.
- https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html — cryptographic design review.
- https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html — key lifecycle.
