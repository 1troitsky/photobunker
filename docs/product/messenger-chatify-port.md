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
| Chatify `MessageBubble`, `MessageList`, `MessageComposer`, overlays/menus | Not yet migrated | **Candidate reuse, not complete**. Inspect dependencies, Matrix-specific semantics, security and existing PhotoBunker behavior before extraction. |
| Chatify Laravel, HTTP API, Echo, Pusher, schema/auth, Pinia server-centric message stores | Not permitted | **Reject** for PhotoBunker. Only a future typed UI-driver port can expose behavior safely. |

The copied/adapted code is a first **UI extraction within PhotoBunker**, not the final externally consumable package. Never create a second copied UI tree in Artefacts: first extract/version a single source and make both applications consume it.

## 3. Delivery in reviewable vertical PRs

| Stage | Visible result | Acceptance criteria |
| --- | --- | --- |
| **PB-U00 (PR #7)** | Import cross-product references, pin/attribute Chatify, replace presentational conversation row, date separators and status glyphs on existing live Matrix screen | Rendering takes display props and emits intent only; existing room selection, archive swipe, unread, last message, mobile/desktop and receipt claims still work. No transport or E2EE changes. |
| **PB-U01 (dependent branch)** | Adapt Chatify sidebar/search/header and responsive shell, retaining PB PWA navigation and existing profile/new-conversation entry | Real rooms, loading/empty/offline/error, safe-area, screen reader and physical 320–1440px layouts; no account mix-up. |
| **PB-U02** | Adapt Chatify bubble, actions, reply/pin, timeline scroll, context/long press and overlays | Real decrypted Matrix timeline, pagination preserving scroll, redactions, locked/undecryptable states, race-safe account switch; no metadata leak. |
| **PB-U03** | Adapt Chatify composer, media picker and voice integration; full optimistic send/retry UX | Existing encrypted voice path retained; temporary client IDs reconcile with Matrix event IDs without duplication, lost ACK/reconnect/recipient error handled; no send outside verified encrypted room. |
| **PB-U04** | Mature Matrix UI adapter and real E2EE cross-device regression | Two accounts, first DM, group, SAS/backup, key restore, unsigned-device rejection, block/revoke, encrypted upload, unread/read honesty, failures, physical iPhone/PWA. |
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
