> **Reference snapshot from Artefacts OS.** Imported for PhotoBunker-first messenger UI work on 2026-10-21 from [artefacts-os @ 85789c47287b](https://github.com/1troitsky/artefacts-os/tree/85789c47287b42a73a21c5335ad67bacabe48110/docs/product). This document describes the *cross-product target*, but Artefacts-specific G8 gates, server-readable transport, Laravel engine and schedules do **not** govern PhotoBunker. PhotoBunker Matrix/E2EE, identity, recovery, media, permission and current behavior contracts remain authoritative. PhotoBunker execution plan: [messenger-chatify-port.md](../../product/messenger-chatify-port.md). This copy is not the shared UI package.

---

# MESSAGES-ACCEPTANCE — executable scope, negative tests and PR plan

**Status:** Normative acceptance design for future G8.S3; **documentation does not authorize implementation before G7 sign-off and owner instruction.** **Date:** 2026-10-21.  
**Sources:** [MESSAGES-PRODUCT](MESSAGES-PRODUCT.md) (MSG01–MSG44), [MESSAGES-ARCHITECTURE](MESSAGES-ARCHITECTURE.md), [Social Foundation](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/product/SOCIAL-FOUNDATION.md) (SF01–SF24), [ADR-0010](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/adr/0010-social-foundation-first.md), [product G8 roadmap](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/product/09-PARITY-IMPLEMENTATION.md).  
**Systems under test:** (A) Artefacts conventional Laravel/postgres server messenger; (P) separate PhotoBunker Matrix/E2EE driver; (U) exactly one shared UI package consumed in both products. Different test guarantees must not be conflated.

> Gate rule: **A feature without a passing real backend + user-journey test is Not implemented.** A green Vue story, GitHub Actions shell check, screenshots or Chatify component does not prove delivery/authorization/crypto on its own.

## 1. Documentation and decision prerequisites

Before any runtime Messages PR:

1. Owner accepts and merges product/architecture/acceptance docs and design direction.
2. G5 corrective work and G6/G7 completed/accepted according to their current gate policy. New plans do not silently start G8 code.
3. G8.S1 Person Profile and S2 Connections/Safety provide tested authenticated Person identity, contact eligibility and always-on block enforcement.
4. Choose Artefacts-specific encryption/retention, DM request policy, read and last-seen privacy, attachment constraints, bilateral deletion policy and approved realtime choice. Record precise defaults in an ADR/delivery ticket.
5. Freeze Chatify **exact upstream commit**, list candidate UI components, verify MIT attribution and perform security/license review. Do not install/execute Chatify migrations against user data.
6. Choose one version-controlled shared-ui source/build/consumption mechanism usable by both Artefacts and PhotoBunker without a copied fork.
7. Verify PhotoBunker Matrix adapter against existing real E2EE/device requirements; **do not** modify its account/key/backend during Artefacts-only work.
8. For each PR: expected user result, affected packages/domains/tables, migration & rollback, API/types, measured UI/network/DB impact, security/privacy tests, manual phone instructions and exact boundaries of what remains absent.

## 2. PR / gate delivery program

The batches are **future** work order proposals inside G8.S3 plus later integrations; batch acceptance never means the whole messenger is complete.

| PR ID | Deliverable and actually working vertical behavior | Dependencies | User acceptance |
| --- | --- | --- | --- |
| **M00** | Compatibility/reuse & UX specification proof: inspect Chatify v2 at pinned SHA, **reuse-first adapt actual Vue Inbox + Thread + Composer + bubble**, recreate only documented incompatible components with approval; common package renders *same* synthetic data via two stub adapters; include license ledger | product specs and owner approvals | U01–U05; zero backend installs/destructive migrations |
| **M01** | Artefacts Messages module + small typed transport driver: UUIDv7 direct/group persistence, memberships, authorize, create/open, idempotent send, inbox and cursor history; one shared UI consumed by Artefacts | G8.S1–S2, Platform Media/Safety/Outbox | A01–A10; noncontact/block policy, real DB not mocks |
| **M02** | Optimistic UI: send/retry/dedupe, reconnect, scroll anchoring, draft and multitab race behavior; edit/reply/reaction/forward/delete-for-me/recall permissions | M01 | A11–A21; no false delivered/read |
| **M03** | Attachments, image albums, resize/previews, voice notes, File/media gallery, safe downloads, sticker/emoji baseline | M01–M02, Platform Media | A22–A29; real S3 and browser/WebKit |
| **M04** | Presence, typing, coarse/hidden last-seen, delivered/read receipts policy, rich authorized search & indexes | M02, explicit privacy policy | A30–A36; no metadata leak |
| **M05** | Inbox full organization: folders/pins/archive/mute/favorites/mark unread, per-chat drafts, group moderation and contact allowlist integration | M01–M04, Connections/Safety | A37–A42; restore across tabs/devices |
| **M06** | Notifications/intents/push integration with G8.S5 Notifications product, bounded fan-out, abuse/rate limits, failure recovery and PWA behavior | M01–M05 and **G8.S5** notifications app | A43–A46; blocked/hidden privacy |
| **M07** | **PhotoBunker adapter:** map existing Matrix timeline, E2EE voice/events/read/search into same built UI package, replace its copied UI only after strict parity and device-recovery tests | common package stable, PhotoBunker owner approval | P01–P12, U01–U09; no plaintext regression |
| **M08** | Product completion/hardening: both apps' acceptance, realistic performance, transport failure/retention/rollback, WebKit/physical-device checks; advanced feature obligations explicitly reported | agreed baseline delivered | PERF01–PERF05, SEC01–SEC08, no hidden gaps |
| **M09 (separate authorization)** | High-impact / advanced: bilateral chat deletion, per-message TTL, scheduling, rich sharing, advanced groups, calling/media RTC and export | owner-specific policy & approval | dedicated privacy, lifecycle, call tests; not implicitly part of M01 |

**Important reconciliation:** Chat/push user notification integration may wait for **G8.S5** even though durable Message/Outbox events are designed in S3. Do not fake Notification-product completion inside Messages. Artefacts M01–M05 can precede M07, but **the shared UI must never be permanently forked**: M00 verifies two adapters, and PhotoBunker actual integration M07 is a tracked requirement for the owner's “one UI” objective. M09 advanced features remain in product inventory until explicitly approved/deferred; the baseline cannot be declared “everything” if M09 functions are absent.

If owner wants PhotoBunker reuse proven **before** shipping Artefacts UI, promote a real Matrix smoke from M07 into M00; this improves portability evidence and avoids a faux-generic abstraction.

## 3. Functional coverage map: nothing quietly omitted

Codes below are the product requirements from MESSAGES-PRODUCT. Every code has owning batch and test IDs, no unassigned requirement.

| Scope | Product IDs | Delivery PR | Acceptance tests |
| --- | --- | --- | --- |
| Start/find chats, group, self-chat, inbox, thread, text | MSG01–MSG06 | M01 | A01–A10, U01–U03 |
| Reply, edit, forward, reactions, all deletion semantics excluding bilateral | MSG07–MSG12 | M02 | A14–A21, SEC03 |
| Explicit delete chat for both | MSG13 | M09 | A47, SEC08 |
| Delivery, optimistic UI | MSG14–MSG15 | M02 | A11–A17 |
| Online, typing, privacy, read visibility | MSG16–MSG19 | M04 | A30–A34 |
| Photo/files/processing/voice/stickers | MSG20–MSG24 | M03 | A22–A29 |
| Search | MSG25 | M04 | A35–A36 |
| Folder/pin/favorite/draft | MSG26–MSG29 | M05 | A37–A40 |
| Sender eligibility/block | MSG30 | M01/S2 + M05 | A06, A41, SEC02–SEC03 |
| Notifications | MSG31 | M06 / G8.S5 | A43–A46 |
| Realtime/multidevice | MSG32–MSG33 | M02, M04, M05 | A12–A13, A42 |
| i18n/accessible UI, group moderation, safety | MSG34–MSG36 | M00–M08 | U01–U09, SEC01–SEC07 |
| Product-specific encryption | MSG37 | M01 + M07 | P01–P12, SEC05–SEC08 |
| Schedule, TTL, export | MSG38–MSG40 | M09 | A48–A50 |
| Calls, rich shares, gallery, advanced groups | MSG41–MSG44 | M03 gallery baseline, M09 advanced | A28, A51–A54 |

## 4. Artefacts real application user journeys (PostgreSQL + browser)

| ID | Given / operation | Required result (include failure state, no frontend-only success) |
| --- | --- | --- |
| **A01** | Person opens own/another public Profile and clicks Message | Opens existing authorized 1:1 or creates once; never changes Follow/Contact automatically |
| **A02** | Person sends to own Saved Messages | Private self-conversation and no recipient notification; no special duplicated Person table |
| **A03** | User creates group, adds three people and leaves | Membership/roles persisted; removed member cannot read unauthorized later content |
| **A04** | Cursor page over 10k messages, page backwards | Stable order, no duplicates/gaps, bounded SELECT and consistent visible scroll |
| **A05** | Authorized user opens inbox after many conversations | Only eligible visible previews/unread counters; no global N+1 fan-out |
| **A06** | Blocked or ineligible actor deep-links to create/send | Denied at service/route/event; no conversation, notification or predictable enumeration |
| **A07** | Two devices open same direct chat simultaneously | At most one canonical direct conversation, proper unique constraint/idempotency |
| **A08** | User attempts group invite / remove / role change without grant | Denied, no ghost membership/event |
| **A09** | User edits group name/avatar/member role where authorized | Current state consistent across participants; protected fields never client-trusted |
| **A10** | User opens conversation via bookmarked URL while module disabled | Safe unavailable response; saved data remains on re-enable |
| **A11** | User sends under normal latency | Bubble and inbox appear immediately as Sending; ACK maps to exactly one authoritative message |
| **A12** | Server commits but HTTP response times out; user retries same op | Exactly one message and attachment association; no duplicated notifications |
| **A13** | Socket event arrives before HTTP ACK / after reconnect | Stable operation ID + server ID dedupe; no double bubble, no jump to wrong conversation |
| **A14** | Invalid send / forbidden attachment / rate limit | Optimistic patch fails clearly with Retry/Cancel; original text/draft retained |
| **A15** | Switch conversation/account while slow response outstanding | Response cannot inject content into wrong account/room or resurrect revoked message |
| **A16** | Send accepted, recipient disconnected | Sender sees Sent, **not Delivered**; only authorized real ACK may set Delivered |
| **A17** | Recipient views thread; sender reads status | Read only on eligible visible messages; don't mark read during prefetch/hidden tab |
| **A18** | Reply to edited/deleted message and navigate to original | Existing authorized quote/link or unavailable placeholder, never stale private body |
| **A19** | Rapid react/unreact/edit same message on 2 devices | Deterministic final state, accurate counts, rollback on version conflict |
| **A20** | Forward Photo/ResourceRef into new conversation | Receivers get correct reference and independent Access checks; no accidental grant/file copy |
| **A21** | Delete message for me vs sender recall for all, clear chat for me | Distinct DB semantics, recipient unaffected by own hide; recall blocks product read across all participants |
| **A22** | Upload multiple large photos / cancel mid-upload | Optimistic progress, bounded S3 uploads, cleanup, safe retry, original/optimized versions per choice |
| **A23** | Send document/video/audio, malformed MIME or over-size file | Real type/size/checksum validation and explicit rejection; no public URL or malware-style inline execution |
| **A24** | View/download attachment after conversation revocation/block | Access reevaluated and denied as defined by current policy; signed URLs short-lived; no stale permanent URL |
| **A25** | Image optimize/transcode process fails | Original not falsely advertised as optimized; retry/degraded preview; EXIF stripped in derivative |
| **A26** | Record, pause, preview, send voice note | Actual recording, audio duration/waveform, seek/speed, Media upload; no phantom message on mic denial |
| **A27** | Sticker/emoji picker, third-party GIF not configured | Emoji/local stickers work, remote provider clearly unavailable; no stealth tracking call |
| **A28** | Thread media/file/link gallery | Authorized typed filters and return-to-message, no cross-thread media leakage |
| **A29** | Safari iPhone image/voice workflows including background/permission denial | Recovery UX, input focus and safe-area correctness; no data leak/false success |
| **A30** | Two devices online/offline, crashed device never cleans up | TTL yields offline; presence does not remain forever online |
| **A31** | Hidden/approximate last seen and blocked viewer | Server/adapters return policy-safe coarse/null only, cannot infer precise timestamp via API/event/cache |
| **A32** | Typing and voice-recording indicator starts/stops | Ephemeral expiry, no cached durable message, no leakage to blocked/hidden participants |
| **A33** | Read receipt disabled or group member removed | No new forbidden read metadata exposed; group read status honest per participant |
| **A34** | Presence hidden but typing/read would reveal timing | Consistent policy either suppresses signals or documents precise independent setting, tested via direct API |
| **A35** | Search across chats, by sender/date/type, inside thread | Authorized, indexed, cursor-bounded; no private result/snippet/count from blocked/removed |
| **A36** | Search term changes rapidly while prior results pending | Outdated response ignored; no stale private matches after account/permission switch |
| **A37** | Create/reorder user folder, toggle filter | Account-only preference, no cross-account leak, preserved on reload |
| **A38** | Pin several messages and chats, unpin/reorder | Separate models for chat pins vs message pins, authorized limits and live navigation |
| **A39** | Archive, mark unread, favorite, mute, unarchive on new incoming | Defined behavior preserved across devices, muted chats keep data but not sound |
| **A40** | Compose in two chats, navigate away/reload/restore | Distinct drafts recovered only under approved persistence privacy; committed send clears exact matching draft |
| **A41** | Allowlist/denylist and contact request policy updated during composing | Revalidation blocks prohibited send before commit; existing private target grants unaffected |
| **A42** | Cross-device unread/pin/folder/reaction state | Converges under out-of-order events and intentional conflict policy |
| **A43** | New eligible message; in-app notification | One correct recipient count/event, no sender self-alert, blocked/muted correctly handled |
| **A44** | Push enabled, app hidden and device online/offline | Privacy-safe preview by policy; no leaked text to unapproved audience; retries are bounded |
| **A45** | Push unavailable/revoked/browser lacks support | Durable message/inbox works; no claim notifications delivered to OS |
| **A46** | Rapid mentions and replies across multiple clients | No duplicate recipient notifications and unread count drift |
| **A47** | Authorized bilateral direct-chat delete, if separately approved | Preview/confirm exact effect; no lie about recipient screenshots/backups; group not affected |
| **A48** | Schedule send, edit or cancel before execution | Correct timezone, one eventual send, recipient eligibility rechecked at delivery |
| **A49** | TTL/auto-delete requested then audience/device offline | Deadline honored server-side; backups/download impossibility disclosed |
| **A50** | Download personal export | Only authorized and current visible history, correct redaction/retention metadata |
| **A51** | Group voice/video call invite/hangup and device loss | Correct call lifecycle, mic/camera prompt, permissions, no cross-room tokens |
| **A52** | Typed location/contact/poll/share | Explicit grant/consent and sanitized links; private resource refs do not widen target ACL |
| **A53** | Expiring group invite / promoted admin | Server rejects expired/reused invite; role actions audited |
| **A54** | Group announcement mode and large membership | Only authorized senders can post, bounded fan-out/cursors and membership rules |

## 5. Shared UX package and PhotoBunker E2EE tests

| ID | Test / implementation evidence |
| --- | --- |
| **U01** | Identical built messenger component source renders synthetic inbox/thread/composer on both host themes, with no Chatify backend assumptions |
| **U02** | Snapshot + interaction parity for desktop two-pane, mobile one-pane (320/390/768/1440), touch long-press, safe-area, visualViewport keyboard |
| **U03** | Optimistic states Sending/Failed/Sent/Read, attachment progress, retry, cancellation and error toasts pass with both adapter stubs |
| **U04** | Back/deep-link preserves conversation and draft; Artefacts Workspace preset switch does not navigate/reset, PhotoBunker dock switch follows its own UX |
| **U05** | UI load uses lazy import; bundle and startup costs measured, no Matrix SDK bundled into Artefacts runtime |
| **U06** | Screen reader labels, keyboard menu, group info and message actions; reduced motion/contrast/zoom, no swipe-only action |
| **U07** | Change a shared Vue component once, bump one package version, both consumers update with no copy/paste patch |
| **U08** | Chatify-derived components carry MIT license notices and pinned upstream attribution; copied files documented; package SBOM/reproducible build |
| **U09** | Capability flags are truthful per chat/driver: unsupported delivered/RTC/server search/remote GIF never shown as working |
| **P01** | Actual PhotoBunker Matrix room appears through shared driver, not a second Laravel conversation/message store |
| **P02** | Device-side plaintext send/receive remains E2EE on wire and on stored Matrix events |
| **P03** | Group membership/room power levels, invite/block/leave reflected correctly with partial failures |
| **P04** | Onboarding recovery restores history/decryption only with authorized account key/device procedures |
| **P05** | Voice/media encrypted locally before upload, sender/recipient playback works without server-side plaintext derivatives |
| **P06** | PhotoBunker search never ships plaintext/index text to server; unavailable keys produce truthful encrypted/unavailable UI |
| **P07** | UI/adapter store no persistent plaintext draft/history/crypto keys beyond existing approved client policy |
| **P08** | Matrix redaction vs clear-for-me/bilateral room deletion reflect actual SDK permissions and limitations |
| **P09** | Offline/reconnect, late Matrix sync, duplicate event and multiple-tab crypto owner handling are stable |
| **P10** | Device revoke/account switch/logout clears old-person event listeners, pending blob URLs and in-memory content |
| **P11** | Same voice recorder and message bubble UX on PhotoBunker Chrome/WebKit without reducing existing accessibility/privacy |
| **P12** | Physical iPhone Safari/PWA smoke where possible, reports pending unsupported states honestly; actual E2EE security review remains separate |

## 6. Security and operational negative tests

| ID | Failure/attack fixture | Must hold |
| --- | --- | --- |
| **SEC01** | Guess conversation ID; forge participant user ID/Actor; manipulate request body | 403/404 non-enumerable, no message/count, event or media leak |
| **SEC02** | Block sender while their send/invite is in flight | Final authoritative decision wins, forbidden message and notification not committed |
| **SEC03** | Unauthorized edit/redaction/clear/participant role, replay stale credentials | Strict permission at mutation time, auditable denial |
| **SEC04** | Forward/link private Note/photo/Artefact as another user | Source and target access separately checked; no media URL/token grant or preview leak |
| **SEC05** | Inspect actual Artefacts DB and backups/production TLS and key config | Encryption-at-rest and transport/access controls verified; **no false E2EE claim** |
| **SEC06** | Push payload, logs, search analytics, front-end errors, S3 signatures | No unexpected message text, recipient list, personal metadata or permanent signed URLs |
| **SEC07** | SSRF via link preview/media URL, ZIP/HTML upload, oversized file, spam burst | Bounded parser, file safety, rate limits, recipient and storage quotas |
| **SEC08** | Request delete-for-all, bilateral wipe, export, account closure with concurrent reads | Exact retention/redaction and disclosure, no unauthorised cross-user erasure |
| **PERF01** | 100/1k/10k conversations and 10k+ messages synthetic workloads | Index use measured via EXPLAIN, bounded SQL, cursor plans; targets set from measured baseline |
| **PERF02** | Rapid updates for 100 concurrent connections in reference environment | p50/p95, CPU/RAM/DB connections, event delay and reconnect measured honestly |
| **PERF03** | 20 simultaneous media uploads with cancel/worker failure | Stable memory/bytes, no orphan/public objects, correct cleanup/retries |
| **PERF04** | WebSocket/Redis/queue/S3 down separately | HTTP send/history work when designed, fail visibly where storage/media needed, durable outbox retries; no lost accepted message |
| **PERF05** | Backup/restore and old schema upgrade, module disable/re-enable | Conversation IDs/links/Media refs valid, no destructive migrations, no hidden recreation of deleted content |

Test labels are **future acceptance IDs, not claims of test implementation**.

## 7. What “complete” means at each layer

### PR-level DONE
- Actual backend/adaptor and UI work for its stated subset, positive+negative tests in PostgreSQL and browser, explicit capabilities. Metrics and rollback evidence recorded.
- The PR cannot assert another feature complete merely because the component/icon exists.
- Migration additive and reviewed; module disable/re-enable behavior tested where applicable.
- Privacy, actor and data lifecycle tests; no Chatify direct destructive migrations or integer-ID assumptions.

### G8.S3 Messages baseline DONE (Artefacts)
- MSG baseline supported in its authorized scope, including Photos/Files/Voice, presence privacy, search, folders, reaction/edit/forward/recall, group permissions and end-to-end real user journeys.
- MSG31 user-facing Notifications/Push requires **G8.S5** to become *complete*; G8.S3 must ship accurate event outbox and in-app unread surfaces without claiming unbuilt Notifications service.
- MSG13 bilateral erase and advanced MSG38–MSG44 **remain outstanding named scope** until owner approves separate policies/PRs; no marketing claim “everything implemented.”
- UI package extraction and dual-driver proof satisfy common-source objective only when M07 real PhotoBunker adoption passes.
- Both privacy modes must be accurately disclosed; Artefacts is not E2EE.

### Cross-product/shared UI DONE
- A single versioned shared UI source actually consumed by both Artefacts and PhotoBunker, correct behavior when capability absent; voice/media/optimistic flows tested on both.
- PhotoBunker retains or improves its current working E2EE behavior, with verification of device recovery and no plaintext-data regressions. E2EE and media security need independent reviews before production claims.
- Component parity does not require backend parity: server search can be shown in Artefacts, only local decrypted search in PhotoBunker.

### Complete social product DONE
- Includes G8.S1 Person, S2 Connections/Safety, S3 Messages and S4 Posts/Feed, plus S5 user Notifications/Moderation. **Do not call Artefacts ready as a full social network from a Message demo alone.**

## 8. Evidence template for every future PR

Include: product MSG IDs and actual acceptance IDs; owning application(s) and public contracts; diff of imported Chatify files + MIT attribution; DB schema/indexes; driver behavior/capability matrix; optimistic race/idempotency tests; threat model negative checks; CI links; manual desktop + mobile screenshots with synthetic data only; media quota/bytes; browser tests; measured SQL/p95/JS bundle; migrations/backout; what was not tested; open policy decisions and next PR prerequisites.

**Do not merge runtime Messages PRs** with unresolved direct authorization bypass, lost message on retry, private attachment leak, false Delivered/Read claim, destructive schema migration, E2EE downgrade of PhotoBunker or code that exists twice instead of actually shared.

## 9. Gate policy / roadmap reconciliation

- G8.S3 is **after accepted G8.S1–S2** and the current G6/G7 platform gates; it is not part of G5 corrective PR.
- G8.S5 user-facing Notification app is separate; M06 explicitly integrates with it later. This prevents Messages secretly writing another Notification system.
- Culture/Editorial/Artefacts/Channels/MySpace are **not** hard dependencies for everyday DM/groups/messages; typed cultural share tests wait for their owner modules.
- PhotoBunker remains independent product/repository; changes there require its own PR, test suite and release decision.
- Calls, timers, bilateral deletion and other advanced features require specific owner policy review, not silent omissions.
- A future agent begins from **MSG00 documentation/reuse assessment**, *not* `composer require munafio/chatify` or installation of its migrations.

**Decision requested before M00:** approve location/versioning of the shared Vue package, exact Chatify-derived component shortlist, and explicitly choose defaults for privacy/retention/read-receipts/bilateral deletion. Do not invent irreversible choices.