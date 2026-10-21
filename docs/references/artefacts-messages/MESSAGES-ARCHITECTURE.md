> **Reference snapshot from Artefacts OS.** Imported for PhotoBunker-first messenger UI work on 2026-10-21 from [artefacts-os @ 85789c47287b](https://github.com/1troitsky/artefacts-os/tree/85789c47287b42a73a21c5335ad67bacabe48110/docs/product). This document describes the *cross-product target*, but Artefacts-specific G8 gates, server-readable transport, Laravel engine and schedules do **not** govern PhotoBunker. PhotoBunker Matrix/E2EE, identity, recovery, media, permission and current behavior contracts remain authoritative. PhotoBunker execution plan: [messenger-chatify-port.md](../../product/messenger-chatify-port.md). This copy is not the shared UI package.

---

# MESSAGES-ARCHITECTURE — shared Vue messenger UI, separate Artefacts and PhotoBunker backends

**Status:** Architecture specification for future G8.S3; **NOT** authorization to start implementation or install dependencies before G7 acceptance and owner command. **Date:** 2026-10-21.  
**Authority:** [ADR-0010](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/adr/0010-social-foundation-first.md), [Social Foundation](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/product/SOCIAL-FOUNDATION.md), [MESSAGES-PRODUCT](MESSAGES-PRODUCT.md), [MESSAGES-ACCEPTANCE](MESSAGES-ACCEPTANCE.md).  
**References inspected:** [Chatify v2 repository](https://github.com/munafio/chatify) (2026-10-21 main, composer version 2.0.0-beta.2), [PhotoBunker](https://github.com/1troitsky/photobunker) main (2026-10-18: Matrix-based E2EE messenger, voice/RTC). **Vendor implementation is not yet accepted.** Freeze exact third-party SHA in reuse ledger before copying/adapting code.

## 1. The one-UI/two-engines decision

**A single source of truth for messenger interface and UX behavior is the requirement.** Avoid two separate message list/composer/state-machine implementations inside Artefacts and PhotoBunker.

~~~text
          Shared Messenger UI (Vue 3 + TypeScript)
  Thread · List · Composer · Media · Voice · Reactions ·
  Folders · Search UI · Settings · Optimistic state machine
                           |
              typed driver / adapter port
                      /           \
      Artefacts adapter             PhotoBunker adapter
      Laravel HTTP + events         Matrix JS SDK + Crypto
      UUID Person/Actor             PhotoBunker Account/MXID
      PostgreSQL Messages           Matrix event history
      Platform Media                Matrix encrypted attachments
      server-side search            client-side decrypt/search
      conventional server security  device E2EE/key backup
                      \           /
           same UX where capabilities match
~~~

- **Shared:** Vue components, TypeScript view-model types, command/query/event interface, conversation/message virtualized presentation, optimistic operation coordinator, input/gesture/accessibility behavior, audio recording/playback components, visual states and contract tests.
- **Artefacts-specific:** platform sessions/Person/Actor, module registry, Access/Safety, ResourceIds, Media API, PostgreSQL/Outbox, notifications, Laravel signed upload/read endpoints, Inertia Shell integration and server-side search.
- **PhotoBunker-specific:** anonymous account/key system, Matrix SDK/room/timeline and E2EE, per-device trust/recovery, encrypted voice/photo attachments, MatrixRTC, PhotoBunker local persistence/privacy rules, Vue Router dock.
- **Never shared as a single backend/database:** account tables, encryption keys, Device IDs, conversation IDs, messages, media ciphertext or retention policies.
- **State adapter MUST be replaceable** without rewriting message bubble/list/composer. Shared UI is not allowed to import Chatify PHP internals, Laravel service classes, Matrix SDK or Inertia router directly.

The shared code should be an independent **versioned internal Vue/TypeScript package** consumed by both repositories. It is not a new network microservice. **Implementation logistics:** prototype the package in a dedicated isolated workspace/repository when the owner authorizes; consume a pinned version/commit in each product. A monorepo, Git submodule or publicly published npm package is NOT preapproved. Avoid building an abstract “framework for all messengers”: only extract UI and behaviors actually implemented in two adapters. A preparatory proof may live temporarily in the Artefacts branch without claiming PhotoBunker integration until CI validates both real consumers.

**Critical test:** change an actual shared MessageBubble/composer once → both Artefacts and PhotoBunker consuming versions show that change without manual port/copy. Two copied Vue folders do not satisfy single-UI requirement.

## 2. Chatify v2 reuse decision matrix

Chatify is the **approved reuse-first UI/UX baseline and implementation source**, NOT directly installed as the production backend or independent full-screen app. The first M00 delivery **must attempt adapting the actual existing Vue components and their visual states**, with a pinned upstream snapshot and before/after screenshots and interactions. Rebuilding a component from scratch is allowed only after a recorded specific incompatibility/maintenance reason (and owner review for replacement of major screen structures); an agent may not silently discard Chatify's mature UI and improvise another messenger design.

| Chatify source area | Decision | Reason / mandatory adaptation |
| --- | --- | --- |
| ConversationList, MessageList, MessageBubble, MessageComposer, ContextMenu, grouped replies | **Candidate ADAPT** | Existing Vue patterns are valuable; remove Chatify global app/store assumptions, replace styles with shared semantic tokens, use transport-agnostic view models |
| Optimistic outgoing-message helpers / stores | **Candidate ADAPT** | Preserve immediate pending UI, but replace server-generated ID assumptions with idempotent op IDs; implement ack/event dedupe, error rollback and offline handling in shared state machine |
| Voice recorder / player UI, Media/Document cards, StickerPicker | **Candidate ADAPT** | Reuse interface components after Safari testing; recording/upload/security route to host adapter; stickers cannot silently call Giphy without approval |
| Presence/Typing/Read receipt visuals | **Candidate ADAPT** | Rendering only; authoritative value must be policy-filtered by each adapter; Chatify presence is based on integer user IDs and approximate heartbeat |
| Theme/Settings/Group UI | **Candidate ADAPT** | Theme tokens determined by host; group powers and settings are adapter capability-driven |
| Chatify Laravel Conversations/Messages/Participants tables | **REBUILD / no direct install** | Chatify migration assumes integer users and has destructive dropIfExists in up(); Artefacts UUIDv7 and module/resource contracts are authoritative |
| Chatify sender, presence, delete/clear services | **REBUILD / behavior reference only** | Multiple (int) user casts; whole-conversation deletion can affect others; block enforcement must work via Platform |
| Chatify attachment service | **DO NOT REUSE** | Own file disk and copies conflict with Platform Media/secure references; PhotoBunker E2EE storage incompatible |
| Chatify Blade-root Vue app and routes | **DO NOT INSTALL AS SHELL** | Artefacts uses one persistent Inertia/Vue Shell; PhotoBunker has separate PWA navigation |
| Chatify contact/user/settings model | **DO NOT REUSE AS AUTHORITY** | Person/Actor UUID and Connections/Platform Safety owners, PhotoBunker Account/Matrix identity |
| Chatify realtime delivery/push mechanism | **RE-EVALUATE** | Events/presence a hint; Reverb/Pusher selection, cost and outage recovery need separate approval |
| Chatify encryption claims | **DO NOT INFER** | Chatify v2 does not establish device-side E2EE; must not become PhotoBunker crypto provider |

**Licence:** current Chatify repository specifies **MIT, copyright Munaf A. Mahdi 2024**. If reusing substantial code or copies, retain copyright/license notice in distributable source/package and record exact upstream file/SHA, modifications, dependencies and upstream update risks. Upstream beta APIs are not treated as stable. Vendor imports are prohibited until a compatibility/license/security review is attached to first implementation PR.

## 3. Minimum typed UI/adapter boundary

The example below fixes **semantic shape**, not a mandatory exported TS file path or naming scheme. Final generated types and DTOs must be reviewed against both backend adapters, without losing privacy guarantees.

~~~typescript
type ProductEngine = 'artefacts-server' | 'photobunker-matrix';
type MessageStatus =
  | 'queued' | 'uploading' | 'sending' | 'sent' | 'delivered'
  | 'read' | 'failed' | 'redacted';

type UxCapabilities = {
  deliveredAcknowledgement: boolean;
  serverSearch: boolean;
  offlineDurableQueue: boolean;
  endToEndEncrypted: boolean;
  videoCalls: boolean;
  voiceMessages: boolean;
  edit: boolean;
  deleteForAll: boolean;
  bilateralDelete: boolean;
  folders: boolean;
  richMedia: boolean;
  push: boolean;
};

type ChatContext = {
  viewerId: string; // opaque, scoped to selected product/account
  engine: ProductEngine;
  capabilities: UxCapabilities;
};

type ViewMessage = {
  id: string; // opaque stable server/Matrix ID, never parsed as int
  conversationId: string;
  clientOperationId?: string;
  senderId: string;
  serverSequence?: string; // optional opaque monotonic sort cursor
  createdAt: string;
  status: MessageStatus;
  kind: 'text' | 'media' | 'voice' | 'system' | 'reference';
  body?: string;
  replyToId?: string;
  media?: ViewAttachment[];
  reactions?: ViewReaction[];
  editedAt?: string;
  redacted?: boolean;
};

type SendMessageInput = {
  conversationId: string;
  clientOperationId: string; // stable retry key, scoped per actor
  body?: string;
  replyToId?: string;
  attachments?: PendingAttachment[];
};

interface MessengerDriver {
  connect(context: ChatContext): Promise<void>;
  disconnect(): Promise<void>;
  capabilities(conversationId?: string): UxCapabilities;
  listConversations(cursor?: string): Promise<Page<ViewConversation>>;
  listMessages(conversationId: string, cursor?: string): Promise<Page<ViewMessage>>;
  sendMessage(input: SendMessageInput): Promise<ViewMessage>;
  editMessage(/* typed intent */): Promise<ViewMessage>;
  react(/* typed intent */): Promise<ViewMessage>;
  deleteMessage(/* typed scope and intent */): Promise<void>;
  markRead(/* conversation and position */): Promise<void>;
  search(/* scoped query */): Promise<Page<SearchHit>>;
  subscribe(onEvent: (event: MessengerEvent) => void): () => void;
  // Other capability-gated operations: groups, media, presence, pin,
  // drafts, notification prefs and RTC are separate narrow interfaces.
}
~~~

The shared package **does not expose a one-size-fits-all persistence service**; drivers may implement optional narrow ports, with truthful capability metadata (global + conversation-level). Never pretend PhotoBunker can server-search E2EE history. Domain view models contain only already authorized information; unknown/decryption-failed media should be a state, not a fake empty text.

**Identity:** host app maps its authenticated Account/Person/Actor to opaque viewerId. A sender/recipient UUID, Matrix MXID, event ID or User ID is not interchangeable. Do not hardwire int casts, parse UUID segments, or allow Chatify-style implicit account registration. Group chats cannot silently send “as Channel”.

## 4. Artefacts secure-server driver (no E2EE)

**User explicitly chose conventional protected server messaging for Artefacts, NOT end-to-end encryption.**

- **Backend:** first-party Messages module Laravel 13/PHP 8.4, PostgreSQL 18, UUIDv7 resource IDs, Module Registry and existing Platform. No dedicated Node message server, no second PHP project or Chatify user schema.
- **Transport security:** HTTPS/TLS for API and WSS for authorized event transport in production, session/CSRF/origin checks and no cross-user event channels.
- **At-rest protection:** production database/storage/backup encryption with managed keys, least-privilege DB/storage accounts, secret rotation and encrypted backups. *Decision for G8.S3:* whether message body also needs application-level encryption at rest; this changes indexed search, key management, backup/restore and moderation. Disk encryption or Laravel Crypt alone does NOT mean E2EE.
- **Server readable:** backend can process plain message after authorization; truthfully disclose that operator/service with privileged access may process text, including abuse review under defined process. Do not claim cryptographic protection from platform operator.
- **Storage owner:** Messages owns Conversations, Participants, Messages, user-scoped view state, read/delivery and reaction state, revisions/redactions, drafts/folders/settings (only if same owner). Platform stores Resource metadata where warranted, bytes in MediaAsset, cross-resource References, authoritative Access/Safety and durable outbox. Notifications module owns user inbox and preferences; no duplicate notifications table inside Messages.
- **Transaction:** validate sender, conversation membership and block/DM eligibility; commit message + idempotency record + outbox intent atomically; acknowledge only after commit. Client retries return same message, not duplicate rows.
- **Consistency:** per-conversation monotonic cursor/order; stable deterministic tie break; cursor pagination. Reactions, edits, clear-for-me and pin operations versioned/idempotent as needed. Consumer events can be delivered out of order/at least once; UI merges based on stable IDs and version/cursor.
- **Search:** indexed, authorized per-conversation and own-inbox text lookup; never global public index over private messages, never unfiltered search cache, no query in analytics/referrer; server search is available precisely because this is not E2EE.
- **Media:** Platform Media private original and derivative preview, gated on current conversation/participant grants at access time, signed short TTL read URLs only after auth; no public S3 object URL or copied attachment on forward. Processing async, quarantines/virus/content checks; EXIF/location stripped from optimized variants; send-as-file originals preserved when selected.
- **Events:** optional Reverb/Pusher-style broadcast after durable commit; cannot be source of truth or synchronous dependency for HTTP send/history. Redis outages must not lose messages. Polling/manual refresh is honest degradation.
- **Retention:** messages/backups/attachments/access logs/deleted rows and exports have an explicit policy approved before production. Remove-for-all can prevent product serving content but does not rewind recipients' downloads, existing backups or screenshots.

**Safety:** Platform Safety (cross-app) enforces blocks, recipient eligibility and rate limits even when Connections UI is disabled. Moderation requests/handling are subject to access/audit, not cultural editor authority. Group member removal/revoked resource grants deny subsequent unauthorized payload/media even if old SPA view model remains stale.

## 5. PhotoBunker Matrix/E2EE driver

PhotoBunker is an independent anonymous/private product, **not an Artefacts feature**. Its current architecture already uses a Laravel Identity↔Matrix bridge, matrix-js-sdk 44, Matrix E2EE/Rust crypto, Matrix event timelines, device recovery, encrypted attachments/voice and optional MatrixRTC/LiveKit. Keep those authorities.

- Map authorized Matrix room/timeline/event objects into shared Conversation/Message view models. Do not create a second Laravel message database to “unify” backends.
- Apply account identity, block, allowlist, Matrix room powers and device trust before sending, joining, reading and callbacks. Re-validate stale UI intents in PhotoBunker adapter; shared UI never grants permission.
- Preserve E2EE: plaintext, message-body text, user private crypto material, media keys and client-only search cannot be uploaded into Artefacts, third-party search or generic analytics/notifications.
- E2EE encrypted attachments/voice are encrypted **client side before upload**. Do not route through Artefacts server image optimizer or public link preview fetcher. File/photo private vault grant is not equivalent to Matrix-room membership.
- Matrix redaction removes authorized Matrix events, not guaranteed deletion from recipients' backups/screenshots. Account-data “clear for me” behavior differs from Artefacts server tombstones; shared UI displays the same intent only where its factual promise can be met.
- In PhotoBunker, plaintext drafts/history may remain in memory per its current privacy design; require separate threat-model approval before introducing localStorage/IndexedDB shared-persistent drafts.
- Device crypto and identity service are loaded lazily when messaging is opened, disconnected and cleared on account switch/logout; no accidental SDK duplication from reusable UI.
- Existing PhotoBunker voice recorder/player and gesture interactions are serious **reuse candidates** for shared UI; import only after browser/physical-device verification, license/ownership review and both-adapter contract tests.
- PhotoBunker MatrixRTC CI currently has unaccepted call end-to-end coverage; **do not claim shared Calls complete by linking the existing component**.

## 6. Optimistic UI is a cross-engine protocol, not decorative animation

### Local operation coordinator

Each local mutation gets an opaque, unique `operationId`, actor/account scope, conversation scope, logical input, local optimistic patch, rollback/reconcile handler and `phase`. An API/Matrix adapter must report:
- accepted/committed with authoritative IDs/version and normalized content;
- recoverable transport error / retryable unknown acknowledgement;
- definitive authorization/policy/validation denial with detailed UI-safe error;
- stream update or reconnect snapshot with stable event identity/version.

**State invariants:**
1. Only one visible bubble for a single logical send across local pending, HTTP ACK, socket event, websocket reconnect and cross-device sync.
2. Retry with **same logical idempotency key**; if server processed operation but response was lost, fetch/ack resolves same record.
3. Old response from chat A/account X cannot overwrite chat B/account Y, including while logging out or switching devices.
4. Timestamp from local clock is provisional; server order/cursor wins on reconcile, without jittering scroll unexpectedly.
5. Attachment progress cannot imply message accepted or file globally public. Cleanup unused failed/cancelled uploads safely.
6. Edits/deletes/reactions/folder/pins update UI immediately but deny/conflict reverts correctly without discarding composer draft.
7. Stable local draft survives accidental drawer/chat changes; server commit clears only matching draft version.
8. Background/offline mode displays queued/retryable truth; no hidden automatic durable send promise unless platform-specific driver proves it.
9. Read and presence never optimistically invent someone else's delivery/read or online status.
10. On reconnect resync from authoritative cursor and reconcile missed/redacted/blocked events, not just append latest.

### Reusable UI state versus privacy

- The **shared coordinator** can handle volatile draft/media preview blobs in memory; host adapter defines whether/how it persists across reloads.
- Artefacts may persist own drafts in explicitly scoped storage with cleanup, cross-account isolation and no sensitive content in analytics/logging. PhotoBunker defaults to memory only; never promote shared defaults into persistent plaintext storage.
- Per-conversation and per-account teardown must clear previews/blob object URLs, listeners, observers, download URLs and pending callbacks. Browser back/forward and Workspace preset change do **not** destroy permitted chat state.

## 7. UX integration contract

**Artefacts:** inject Messenger UI into a Messages module Inertia screen; load bundle lazily on route entry, register Workspace destination via Module Registry. Active conversation route/deep link is a first-party route; switching Personal↔Explore↔Custom sidebar does not reload thread. Use Platform UI tokens and accessible primitives. Keep messaging state in module lifecycle; cleaning on logout/module disable, **not** on sidebar preset changes.

**PhotoBunker:** inject same package into existing Vue Router PWA, adapting its own dock/account themes. Small-screen conversation/thread navigation, safe areas, voice and photo capture respect PhotoBunker device permission and privacy UX. No Inertia dependency in shared UI.

**Chatify visuals:** rework Chatify conversation list, bubble, composer, group, search and settings components into shared UI package rather than copying its whole full-screen Vue app. Preserve touch/keyboard parity and aesthetic quality as design acceptance; do **not** claim design parity from screenshots alone. Refer to [Figma Workspace](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/ui/WORKSPACE-NAVIGATION.md) only for Artefacts surrounding Shell.

## 8. Portability proof, development boundaries and rollback

**Mandatory POC before main implementation:** run a small shared UI Storybook/test harness or equivalent without a server; render real synthetic conversations through (1) stub Artefacts driver and (2) stub Matrix driver using the *same built package artifact*, plus one real-message contract smoke for each live adapter as they become available. Choose a production-safe package lock/publishing strategy before treating two products as consuming it.

First implementation slice should not attempt all MSG01–MSG44 simultaneously: release in accepted batches, but track unimplemented features openly. Any Chatify upstream code import needs a ledger of files, pinned SHA, MIT notice and adaptation diff; if extraction proves more expensive than a clean component, REBUILD instead. Do not build a compatibility facade for Chatify SQL models as an excuse to change Platform Identity.

**Fallback:** on third-party UI incompatibility, recreate individual Vue components to the approved UX contract without changing domain API. On backend vendor failure, Artefacts first-party driver remains authoritative. On PhotoBunker Matrix failure, don't fall back to server plaintext messages.

**Dependencies:** zero changes to G5 Notes, G6 Media Library, Workspace, pending Codex local corrections during this documentation work. First runtime PR after G7 must demonstrate exact dependency boundaries and get explicit owner approval.

## 9. Open decisions needing named sign-off before coding

1. Where shared package lives and how both repos consume it (single versioned source, reproducible builds). Must not copy-and-paste.
2. Chatify components permitted for reuse at **pinned SHA**, CSS/theming approach, license notice inventory.
3. Artefacts at-rest message-body encryption option and privacy/backup retention; searchable plaintext tradeoff.
4. Recipient policy: noncontact DM requests, allowlist/block defaults, group invitations, last-seen visibility and read receipts.
5. Bilateral deletion (MSG13): exactly who can invoke, existing recipient copies, old messages and backup semantics.
6. Max group size, per-file quotas/sizes, video transcoding/support, spam budgets, sticker/GIF provider and consent.
7. Artefacts realtime service (if any), optional push/service-worker architecture, mobile Safari background limitations.
8. PhotoBunker crypto/decrypted-content persistence and voice/photo existing feature parity — **must not relax E2EE**.
9. Call backend choice and scope of MSG41, separate from messaging baseline acceptance.

**No implementation agent may decide these silently.** The definitive tests and PR split are in [MESSAGES-ACCEPTANCE](MESSAGES-ACCEPTANCE.md).