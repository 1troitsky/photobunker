# PhotoBunker-first Chatify UI port — staged working contract

**Date:** 2026-10-21  
**Status:** PB-U00 is proposed in PR #7; PB-U01 follows as a dependent review on `feat/chatify-pb-u01-navigation-layout`. These changes are not merged and are not production-accepted. Only changes actually merged and tested against the real Matrix backend can be considered working. **PhotoBunker is the first consumer; Artefacts is the later second consumer.**

## 1. Owner decision, scope and precedence

Use PhotoBunker's already functional encrypted messenger to develop the reusable messenger UI/UX **before** introducing it into Artefacts. Reuse the actual Chatify v2 Vue 3 source for appropriate components, with clear attribution and pinned upstream SHA. Do **not** install Chatify's PHP/Laravel package, migrations, account schema, API, realtime drivers or Pinia data stores; Chatify's server-readable backend is incompatible with PhotoBunker's Matrix E2EE boundary.

Read [Artefacts reference product](../references/artefacts-messages/MESSAGES-PRODUCT.md), [reference architecture](../references/artefacts-messages/MESSAGES-ARCHITECTURE.md), [reference acceptance](../references/artefacts-messages/MESSAGES-ACCEPTANCE.md), [PhotoBunker messenger UX](messenger-ux.md), [Matrix E2EE/voice ADR](../adr/0016-direct-messenger-and-voice.md), [device recovery ADR](../adr/0007-matrix-messaging-and-recovery.md), and [existing messenger-actions runbook](../operations/messenger-actions.md).

PhotoBunker's existing Matrix + Rust/WASM crypto SDK stays responsible for rooms, authenticated identity, membership, timeline, outgoing encryption, inbound decryption, event redaction, encrypted media, trust, key backup/recovery and receipts. Account/device lifecycle and photo encryption must not change in a UI PR. Keep `apps/web/src/messages/store.ts` as the existing backend implementation until an explicit, independently tested transport-adapter extraction. Never persist decrypted messages/drafts/media in new IndexedDB/localStorage, browser logs, analytics, error reporting or unencrypted server storage. The UI must disappear/clear when the account locks or changes, page is hidden, or the crypto state fails.

## 2. Provenance and reuse ledger

Upstream: [munafio/chatify](https://github.com/munafio/chatify) **v2**, commit `4a39eacb44e2405baa8c1e3bd3b4644fc5c8707d` (2026-08-10), MIT, © 2024 Munaf A. Mahdi. See [preserved MIT license](../../apps/web/src/messages/shared-ui/CHATIFY-LICENSE.txt).

| Component upstream | PB extraction | Decision / changes |
| --- | --- | --- |
| `frontend/src/components/sidebar/ConversationListItem.vue` | `apps/web/src/messages/shared-ui/ConversationListItem.vue` | **Adapt** presentation/markup to typed display-only data. Remove Pinia, Laravel conversations, API config/presence, Tailwind namespace; preserve existing PB actions/swipes and E2EE preview source. |
| `frontend/src/components/thread/MessageDateSeparator.vue` | `apps/web/src/messages/shared-ui/MessageDateSeparator.vue` | **Adapt** label-only component using PB theme instead of Tailwind. |
| `frontend/src/components/thread/MessageStatusTicks.vue` | `apps/web/src/messages/shared-ui/MessageStatusTicks.vue` | **Adapt** SVG; hide second tick on `sent` and show it only for a verified `read` receipt. `sending` and `notSent` remain separate PB states. No inferred `delivered` event. |
| `frontend/src/components/sidebar/ConversationSearch.vue` + `ui/SearchField.vue` | `apps/web/src/messages/shared-ui/ConversationSearch.vue` | **Adapt** controlled search field; preserve local decrypted search through the existing host store; no Laravel API or telemetry. |
| `frontend/src/components/sidebar/Sidebar.vue` | `apps/web/src/messages/shared-ui/SidebarHeader.vue` | **Adapt** compact heading and slots; host still supplies account labels, contact/new chat actions and errors. |
| `frontend/src/components/thread/ThreadHeader.vue` | `apps/web/src/messages/shared-ui/ThreadHeader.vue` | **Adapt** header, avatar, back/identity/actions. Host exclusively controls profile, call eligibility, verified read and last-seen visibility; no false presence. |
| `frontend/src/components/layout/ChatifyApp.vue` | `apps/web/src/messages/shared-ui/MessengerSplitLayout.vue` | **Adapt** responsive two-pane composition; PhotoBunker retains full-screen mobile PWA shell and room selection state. |
| Chatify `MessageBubble.vue` and delivery status | `apps/web/src/messages/shared-ui/MessageBubble.vue` | **Adapt** accessible bubbles with grouped rows, read ticks, reply jump, optional host-provided voice/photo slots, long-press events; host supplies only display-ready values. |
| Chatify `MessageList.vue` | `apps/web/src/messages/shared-ui/MessageList.vue` | **Adapt** type-safe keyed day separators and slots; host remains responsible for scroll position, Matrix pagination, unread and timeline locks. |
| Chatify `MessageActionsMenu.vue` | `apps/web/src/messages/shared-ui/MessageActionList.vue` | **Adapt** visible list of authorized actions, provided by PhotoBunker's Matrix power-level checks; emits intents only. |
| Chatify `ScrollToBottomButton.vue` | `apps/web/src/messages/shared-ui/ScrollToBottomButton.vue` | **Adapt** scroll affordance using host-provided label/unread count; host owns read receipts and actual scroll target. |
| Chatify `frontend/src/components/thread/MessageComposer.vue` | `apps/web/src/messages/shared-ui/MessageComposer.vue` | **Adapt** controlled text input, replies, visible encrypted host voice slot, keyboard submit and auto-resize. No Chatify backend, file uploads or voice recorder duplicates. |
| Preflight optimistic Matrix text | `apps/web/src/messages/optimistic.ts` + current `messages/store.ts` | In-memory placeholder before network preflight, stable `pb-UUID` transaction ID passed to Matrix SDK, dedupe by matching transaction/server IDs; SDK local echo and resendEvent authoritative. No body-based dedupe or durable plaintext queue. |
| Chatify attachment picker, previews and cards | `apps/web/src/messages/shared-ui/MessageComposer.vue`, `EncryptedAttachmentView.vue`, `messages/attachment.ts` | **PB-U04:** 1 E2EE image/document attachment at a time; picker, drop/paste, local preview, explicit decrypted open/save, JPEG/PNG/WebP re-encoding to remove EXIF, MIME/byte bounds. Matrix file encryption/upload/decryption owned by PB host, not shared UI. **No album/multi-upload yet.** |
| Chatify remaining context overlays, emoji, stickers, multi-image albums | Not yet migrated | Do not imply complete. |
| Chatify Laravel, HTTP API, Echo, Pusher, schema/auth, Pinia server-centric message stores | Not permitted | **Reject** for PhotoBunker. Only a future typed UI-driver port can expose behavior safely. |

The copied/adapted code is a first **UI extraction within PhotoBunker**, not the final externally consumable package. Never create a second copied UI tree in Artefacts: first extract/version a single source and make both applications consume it.

## 3. Delivery in reviewable vertical PRs

| Stage | Visible result | Acceptance criteria |
| --- | --- | --- |
| **PB-U00 (PR #7)** | Import cross-product references, pin/attribute Chatify, replace presentational conversation row, date separators and status glyphs on existing live Matrix screen | Rendering takes display props and emits intent only; existing room selection, archive swipe, unread, last message, mobile/desktop and receipt claims still work. No transport or E2EE changes. |
| **PB-U01 (dependent branch)** | Adapt Chatify sidebar/search/header and responsive shell, retaining PB PWA navigation and existing profile/new-conversation entry | Real rooms, loading/empty/offline/error, safe-area, screen reader and physical 320–1440px layouts; no account mix-up. |
| **PB-U02 (PR #9)** | Adapt Chatify bubble, actions, reply/pin, timeline scroll, context/long press and overlays | Real decrypted Matrix timeline, pagination preserving scroll, redactions, locked/undecryptable states, race-safe account switch; no metadata leak. |
| **PB-U03 (PR #10)** | Adapt Chatify composer, media picker and voice integration; full optimistic send/retry UX | Existing encrypted voice path retained; temporary client IDs reconcile with Matrix event IDs without duplication, lost ACK/reconnect/recipient error handled; no send outside verified encrypted room. |
| **PB-U04 (PR #11, attachment UI)** | Implement secure image/document attachments + UI polish before later whole-product QA | Two accounts, first DM, group, SAS/backup, key restore, unsigned-device rejection, block/revoke, encrypted upload, unread/read honesty, failures, physical iPhone/PWA. |
| **PB-U05** | Extract and version a *single* shared Vue/TS UI source with typed driver; consume it from PB | UI has zero Matrix/Laravel/PhotoBunker imports. No separately maintained copies. Run shared component/contract suite with synthetic stub and actual Matrix backend. |
| **AR-U01 (later, separate repo/approval)** | Connect Artefacts Laravel server driver to the **same** shared UI package | Artefacts-specific authorization/contacts/retention, Media, outbox/realtime and Optimistic UI tests; keep server-readable vs E2EE claims distinct. |

PB-U01–PB-U05 and AR-U01 are not implemented by PB-U00. Original Artefacts M00–M09 remains a requirement inventory, but its original implementation order is superseded by this owner-approved PhotoBunker-first plan for the UI.

## 4. Security, behavior and testing invariants

- A presentation component receives only display-ready text and emits a selection/interaction event. It never resolves identities, fetches rooms, copies account secrets, emits telemetry, stores message body or opens an external URL.
- Decrypted previews stay only in live in-memory reactive state provided by the existing Matrix boundary. Blocked users and unresolved technical Matrix IDs must not become public profile labels.
- `sending` means local pending, `sent` means accepted/echoed per current Matrix store, and `read` only means a genuine Matrix receipt from the relevant recipient. Do not call `sent` “delivered”.
- Keep current block, encryption, signed-device isolation, delete-for-me/everyone, room power levels and voice/RTC implementations; refuse any UI adaptation requiring a security downgrade.
- Cross-device reception, Matrix key verification, locked state and voice access need real runtime tests, not only Vue snapshots.
- Per-PR gates: `cd apps/web && npm ci && npm run check`; E2EE `check-messages.mjs`, `check-messenger-ui.mjs` and `check-messenger-actions.mjs` in Chromium and WebKit via the existing live Compose/browser QA environment; `./scripts/dev check` and `./scripts/dev smoke` as documented. Installed PWA on physical phones remains an independent acceptance gate.
- For any test not runnable in the code-editing environment, mark it **not run** in the PR. Never claim full product or cryptographic acceptance based only on static review.

## PB-U01 checkpoint — 2026-10-21

PR #8 (PB-U01) composes the **existing Matrix-backed** `MessagesView.vue` using adapted Chatify-derived `SidebarHeader`, controlled `ConversationSearch`, `ThreadHeader` and `MessengerSplitLayout`. It retains existing new chat, contacts, archive, search command, group details, voice/call actions, message receipt status, and mobile selection/back behavior; refined desktop 340–380px list width, compact headers, iPhone-safe 16px search text, keyboard focus styles and a narrower 320px layout. These are code changes awaiting CI and real browser QA, **not a pass claim**.

No cryptography, Matrix SDK, API, Laravel, storage or routing protocol modifications are included. PB-U02 will transfer the Chatify bubble/timeline/actions; PB-U03 will follow with composer and validated optimistic reconciliation. The second product must consume one extracted versioned UI source, not copies of the PB component tree.

**CI staging:** Feature-base pull requests are included in the PR trigger from PB-U00's updated `.github/workflows/ci.yml`; verify the actual PR run before review. A successful unit/build step is distinct from MatrixRTC/Matrix E2EE/browser acceptance.

## PB-U02 checkpoint — 2026-10-21

PR #9 is based on PB-U01, and is **not** a shipped feature or completed security audit. The live Matrix timeline now renders through a generic `MessageList` keyed date-group component and a Chatify-derived `MessageBubble` with host-supplied decrypted body, optional encrypted voice/photo slots, read-status glyph, sender, quote previews and selection. `MessageActionList` renders the *existing permission-filtered action inventory* (reply, copy, pin, select, failed retry and delete), retaining the existing PhotoBunker `AppSheet` host and permission enforcement. `ScrollToBottomButton` replaces the former hand-written affordance, without a fake unread count.

New navigation guards prevent a delayed history-load action or scroll measurement from jumping into an unrelated room after a room switch. Existing `olderMessages` and `loadAllMessages` remain the source of truth: no newly persisted decrypted data, no changes to Matrix event IDs, encrypted voice upload, redaction, verified device gate or pending-message reconciliation. PB-U03 remains responsible for Composer and fully verified Optimistic UI integration.

Acceptance before merge: `npm run check`, live E2EE and browser QA suites, thread gestures on 320/390/768/1440, selected-message permissions, locked/undecryptable content without preview leakage, voice/photo slots, scroll retention during incoming/ACK, and physical PWA follow-up. Static typed component tests are necessary but not a substitute for real-account Matrix tests.

## PB-U03 checkpoint — 2026-10-21

PR #10 develops on top of PB-U02 and is **draft until both real Matrix E2EE and cross-browser acceptance pass**. It integrates a Chatify-derived controlled `MessageComposer` with the same PhotoBunker voice recorder slot; the Matrix SDK still handles encryption, queueing and retries. The UI accepts a local text draft synchronously and the host immediately clears only that accepted draft, rather than clearing by comparing a later Matrix event body. Failed local validation preserves draft. Existing room-specific in-memory drafts, encrypted voice upload, linked photo authorization and call controls remain owned by PhotoBunker.

**Optimistic stages:** `UI queued (sending)` → `Matrix SDK local echo (sending)` → `server-ACKed/synced (sent)` → `actual recipient read receipt (read)`. A **preflight failure** shows `notSent`, with retry reusing the same transaction ID. After SDK local echo, use Matrix `resendEvent` and retain its own transaction ID. No separate delivered status is claimed; successful server ACK is **not** proof of delivery to the recipient.

**Implementation discipline and residual limits:** The in-memory preflight record is scoped to account session and room, cleared by `stopMessaging`, and suppressed when a matching Matrix transaction or server event appears; identical plaintext is never sufficient to reconcile. `sendVoice` remains the pre-existing separate encrypted voice path. No unencrypted attachments, generic upload picker, background durable queue, cross-session persisted drafts, multi-device unsent recovery or E2EE message push are implemented by this PR; do not advertise these as complete. A server-ACKed text message does not change back to `notSent` solely due to a later key-backup error.

**Acceptance additions:** test two equal rapid sends (distinct txn IDs), stalled preflight, blocked user/revoked room after queue, failure before SDK echo, SDK `not_sent` retry, offline→online return, successful ACK before sync echo, switch rooms/account during send, original voice path, 320px PWA/IME keyboard and E2EE real-account reception. Unit tests for pure reconciliation do **not** cover Matrix SDK side effects; the browser/Matrix integration run is required. Check job logs for other subsystem timeouts (notably MatrixRTC) separately from build/test failures. 

## PB-U04 attachment and interaction stage — 2026-10-21

A functional **single-file** attachment flow is added to the live Matrix messenger, not only static visuals:

- Host file picker, drag/drop, paste of a File, cancel, local image preview, per-send busy/error states, and automatic clear only on successful send.
- All supported original image formats (JPEG/PNG/WebP) are decoded and re-encoded locally before upload. Max edge 2560px. This removes source EXIF/location metadata; for safety unprocessable images are rejected rather than uploaded raw. **Do not claim that PDF/TXT/ZIP metadata is scrubbed** — those file bytes are encrypted but unchanged.
- Explicit allowlist: JPG, PNG, WebP, PDF, TXT and ZIP, one attachment per event, max 15 MiB. No HTML, SVG, executable uploads or uncontrolled remote previews. No unencrypted attachment URL is sent, and the Matrix media upload uses an octet-stream ciphertext container and non-revealing file name.
- Event payload is an encrypted Matrix `m.image`/`m.file` event, with encrypted `file` metadata, safe filename/info and optional caption/reply. The receiving device decodes it only from an authorized decrypted room timeline. `EncryptedAttachmentView` fetches/decrypts on explicit interaction; no background plaintext caching, and its object URL is revoked on unmount, hidden state or account lock.
- Non-attachment Matrix E2EE/voice, call UI, existing photo grant references and messages are preserved. Sending media does **not** bypass verified device gating, rechecked membership or local contact block policy. A separate key-backup failure is not misrepresented as an attachment send failure.
- Expected QA: actual two-account encrypted file/image send/receive, EXIF removed after browser image re-encoding, inaccessible room/blocked peer, failed upload retry with selected File retained, CSS at desktop/phone breakpoints, WebKit/Chromium. Physical phone PWA review deliberately deferred until final integration as requested.
- Not part of this PR: GIF/HEIC/video, multiple file albums, infinite-sized uploads, durable offline plaintext queue, generic public attachments, edit/reactions/stickers, download persistence of decrypted data beyond explicit user export. Distinct UI drivers remain the next work.

This PR is a work-in-review until automated checks pass; this section documents intended acceptance, not a pass claim.

## PB-U04b — editing and emoji reactions (PR #12 proposal)

This UI/UX completion stage is a **stacked draft** based on PB-U04a PR #11; the previously defined PB-U05 remains the *shared versioned UI extraction*, not this stage.

- Text editing uses the canonical Matrix encrypted `m.replace` relation. Only the sender's already ACKed, decryptable `m.text` events without file/photo payloads are eligible. The original event stays in place, without showing the edit relation as a second bubble. A visible "edited" marker comes from Matrix SDK's aggregated replacement, never merely optimistic client state.
- Entering edit mode preserves the previous text/reply draft in a temporary, account-scoped snapshot. A failed edit keeps the edited draft; cancel or successful ACK restores the previous composer draft. Changing rooms cancels editing; attachments, drag/drop and the recorder are disabled while an edit is active. Existing Matrix encryption/trust/membership/blocked checks apply before and after async preflight.
- Reactions use standard encrypted `m.reaction` `m.annotation` events, with a finite local 5-emoji picker, per-message chips and counts. Only authenticated decrypted, non-redacted, non-blocked relations are aggregated; each person counts at most once per key. A user's second click redacts their own existing reaction through the Matrix SDK. In-flight operations are guarded against duplicate submissions.
- The shared components receive only display-ready `edited` and reaction data and emit `react`/`edit` intents; they import no Matrix, Laravel/PhotoBunker account, private file, or network implementation.
- Reaction and replacement control events must **not** appear as independent text bubbles, search results or inbox previews. Text-only edits deliberately cannot modify attachments, voice clips or linked private photos. Message forwarding, cross-room authorized attachment grants, presence and typing remain separate work; do not claim implemented.
- Gate with strict Vue tests, Matrix E2EE browser scenarios in Chromium/WebKit and checks for sender-only edits, blocked/locked rooms, reaction toggle/redaction, account switch during edit, restore previous draft, synthetic non-text relation injection and real time screen. Physical iPhone/Android PWA manual QA is deferred to the final stage per owner.
