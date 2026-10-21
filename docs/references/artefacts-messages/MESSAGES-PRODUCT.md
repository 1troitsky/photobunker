> **Reference snapshot from Artefacts OS.** Imported for PhotoBunker-first messenger UI work on 2026-10-21 from [artefacts-os @ 85789c47287b](https://github.com/1troitsky/artefacts-os/tree/85789c47287b42a73a21c5335ad67bacabe48110/docs/product). This document describes the *cross-product target*, but Artefacts-specific G8 gates, server-readable transport, Laravel engine and schedules do **not** govern PhotoBunker. PhotoBunker Matrix/E2EE, identity, recovery, media, permission and current behavior contracts remain authoritative. PhotoBunker execution plan: [messenger-chatify-port.md](../../product/messenger-chatify-port.md). This copy is not the shared UI package.

---

# MESSAGES-PRODUCT — complete functional contract for Artefacts Messages and shared messenger UX

**Status:** Product scope accepted for specification; implementation remains gated by G8.S3 and explicit owner authorization. **Date:** 2026-10-21.  
**Authority:** [ADR-0010](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/adr/0010-social-foundation-first.md), [Social Foundation](https://github.com/1troitsky/artefacts-os/blob/85789c47287b42a73a21c5335ad67bacabe48110/docs/product/SOCIAL-FOUNDATION.md), [MESSAGES-ARCHITECTURE](MESSAGES-ARCHITECTURE.md), [MESSAGES-ACCEPTANCE](MESSAGES-ACCEPTANCE.md).  
**Visual reference:** [Chatify v2](https://github.com/munafio/chatify) — a candidate **source of messenger UI/UX components**; not an accepted replacement for Artefacts Platform, identity, Media, safety or backend.  
**Second consumer:** [PhotoBunker](https://github.com/1troitsky/photobunker) — separate product, Matrix/E2EE stays intact. The **same shared messenger UI package** is the goal; do not unify the two products or their data.

> **Definition of done:** Messages is a complete everyday messenger inside the social network, not a textarea + Send button. Implement and test every baseline behavior below; features outside a particular PR remain explicitly **Not implemented**, never silently redefined as DONE.

## 1. What the product is

One coherent messaging experience: conversation list → conversation thread → composer, connected to Person/Profile, Connections and Notifications as permitted. Dedicated Messages page exists inside one persistent Artefacts Vue/Inertia Shell and its Personal/Explore/Custom Workspace navigation presets. On mobile it behaves like a native messenger (single pane at a time); on desktop the list and thread can be shown together. No second Blade shell, jQuery interface or page refresh when changing conversations.

**Shared UX goal:** One maintained component/component-behavior source for Artefacts and PhotoBunker, with two separate adapters: Artefacts secure server messenger, PhotoBunker Matrix/E2EE. **Reuse-first instruction:** Start from Chatify v2's existing Vue 3 UI (component code and coherent visual/interaction patterns) for the messenger surface instead of asking an agent to invent a fresh interface; replace only parts that fail requirements after a documented compatibility review. Visual details, component ergonomics and Optimistic UI are shared where semantics match. When engines do not support a capability, the UI must not display it as working.

**Security goal differs by product:** Artefacts = conventional server-readable messages, transport encryption, protected storage/backup and server-side authorization. PhotoBunker = its existing device-side E2EE Matrix/key-recovery design, no plaintext cache/push/search service.

## 2. Function inventory and status rules

Every feature has an ID used by acceptance tests. **B** = essential everyday messenger baseline, required before the Messages feature can be publicly called complete. **A** = advanced, still explicitly tracked as a product requirement; may be a separate signed-off delivery increment. **P** = separate integration or policy decision before implementation, never silently omitted. These are **product priorities**, not evidence of implementation.

| ID | Priority | Area | Required user-visible behavior |
| --- | --- | --- | --- |
| MSG01 | B | Direct chat | From public Profile, contact lookup or exact handle: find existing 1:1 or start new authorized conversation; idempotent creation |
| MSG02 | B | Group chat | Create with name/avatar, choose participants, invite/remove/leave; roles owner/admin/member; permissions and membership history |
| MSG03 | B | Saved Messages | Private conversation with self, stored/synced only for owner, can forward/share into it |
| MSG04 | B | Inbox | Avatar, display name, last authorized preview, timestamp, unread count, mention marker, pinned/archived/muted state |
| MSG05 | B | Thread | Chronological grouping, day separators, sender grouping, timestamps, scroll-to-bottom, loading older without scroll jumps |
| MSG06 | B | Text | Multiline, emoji, Unicode, safe links, no executable HTML; Enter/Shift+Enter policy varies correctly by device |
| MSG07 | B | Replies | Reply points to stable original message; quote preview never exposes deleted/inaccessible body; jump to source when allowed |
| MSG08 | B | Edits | Sender may edit allowed text; edited marker; optimistic edit then authoritative result and conflict/failed-state recovery |
| MSG09 | B | Forward / share | Forward message or typed ResourceRef with attribution, correct new conversation permissions; no copying private media or grant |
| MSG10 | B | Reactions | Add/remove named emoji reactions; per-message aggregated counts + authorized participant identities; rapid-toggle dedupe |
| MSG11 | B | Message deletion | **Delete for me** is per-viewer hide; **delete for everyone** is authorized recall/redaction of sender's permitted messages (group admins only by explicit policy) |
| MSG12 | B | Chat deletion | Archive, hide, clear for me, leave group, group deletion by allowed owner; separate semantics, no implicit global delete |
| MSG13 | P | Remove history for both | Explicit destructive bilateral direct-chat action with confirmation and carefully defined permission/retention — **not equivalent to deleting own inbox** |
| MSG14 | B | Delivery state | Local queued/sending, accepted by server, failed/retry; delivered-to-device **only if actual recipient acknowledgement exists**, read only on explicit read |
| MSG15 | B | Optimistic UX | Immediate local chat/message/reaction/edit/delete/pin previews, stable client operation IDs, retry/rollback/reconciliation; no false success |
| MSG16 | B | Presence | Online/offline where consent allows, last active (precise or coarse privacy bucket), expiry of stale sessions |
| MSG17 | B | Composing signals | Typing (and voice recording if enabled) ephemeral, short TTL, visibility policy, multi-device aggregation, not permanent chat record |
| MSG18 | B | Presence privacy | Per-person audience exact/coarse/hidden: e.g. recently/this week/long ago; server enforces policy, not CSS obfuscation |
| MSG19 | B | Read receipts privacy | Independently configurable where visible; recipient/group read semantics; no “delivered” inferred from HTTP accepted |
| MSG20 | B | Photo sending | Multiple images, album/grid, drag/drop/paste/camera picker, progressive upload, preview/lightbox, explicit original vs optimized quality |
| MSG21 | B | Files | Documents/audio/video as allowed, filename/type/size/checksum, preview where safe, attachment retry, download via authorized Media |
| MSG22 | B | Media processing | Original preservation policy, safe image resize/format/thumbnail, EXIF/location stripping for optimized variants, video poster and bounded processing |
| MSG23 | B | Voice messages | Record, pause/resume, lock/cancel swipe, preview, send/retry, duration + waveform, seek and playback speeds; gracefully handle Safari |
| MSG24 | B | Emoji/stickers/GIF | Emoji picker; sticker packs (including user-added packs after review), search/use; GIF only through privacy-reviewed provider or local catalogue |
| MSG25 | B | Search | Global inbox text/search chats + authorized message text, inside-chat full-text, filters person/date/media/link/file; cursor pagination and indexing |
| MSG26 | B | Folders | Built-in All/Unread/Personal/Groups/Archive plus editable personal folders/rules/order and per-conversation membership |
| MSG27 | B | Pin | Pin/unpin/reorder chats; independently pin multiple messages per conversation with authorized limits and navigation to each |
| MSG28 | B | Favorites / mute | Favorite conversations/people, silent conversations, notification schedule/preferences, mark unread, archive/unarchive |
| MSG29 | B | Drafts | Per-conversation text/reply/attachment metadata draft, restore on switch/reload according to privacy policy, clear only on committed send or explicit discard |
| MSG30 | B | Contacts / eligibility | Exact-handle search, contacts/requests, allowed senders, allowlist/denylist, block/report/mute; no implicit Follow/Contact/grant |
| MSG31 | B | Notifications | In-app unread and desktop/mobile web push where supported/permissioned, per-chat mute, duplicate-safe event delivery, privacy-safe previews |
| MSG32 | B | Realtime/failure | New messages and state changes quickly when connected; HTTP send/history unaffected when WebSocket is down; offline UI and reconciliation on reconnect |
| MSG33 | B | Multi-device | Server-truth sync for inbox, read and folder/pins, no duplicate sends; separate device rules for confidential PhotoBunker crypto state |
| MSG34 | B | Localization/accessibility | Keyboard/touch, screen reader, contrast, reduced motion, zoom, RTL readiness and strings from app locale |
| MSG35 | B | Group moderation | Invitations, joining approvals/limits if configured, revoke member, history visibility policy, owner transfer, ban/rate limits |
| MSG36 | B | Privacy/safety | Strict authorization and non-enumeration, blocks enforced beyond UI, safe attachment delivery, report/review and anti-spam |
| MSG37 | P | Encryption | Artefacts conventional protected server messages; PhotoBunker existing Matrix E2EE. Different claims, same visible UX where accurate |
| MSG38 | A | Scheduled sending | Schedule for permitted time and timezone, cancel/edit before execution; queued server policy and retries |
| MSG39 | A | Auto-delete / TTL | Per-message/conversation expiration under authorized retention policy; explains guarantees and limitations |
| MSG40 | A | Export | User-accessible export of their authorized chat history/attachments; respect hidden/redacted and other participants |
| MSG41 | A | Audio/video calls | 1:1 and group calling with separate approved signaling/media backend, call invitations, denied mic/camera and iOS lifecycle |
| MSG42 | A | Rich attachments | Polls, location sharing (explicit permission), link cards, contact cards, typed Culture/Work/Post shares; no implicit source ACL |
| MSG43 | A | Media gallery | Shared photos/files/links per conversation, filtered authorized results, download and jump-to-message |
| MSG44 | A | Advanced groups | Join links with expiry, invite moderation, group descriptions, multiple admins, optional announcement-only group mode |

**Completeness rule:** No feature can be marked complete solely by a Vue component, fixture, mock or Chatify README claim. Definition is a working API or Matrix adapter, UI, privacy/negative tests and actual desktop/mobile behavior. Changes to B/A/P require an explicit product decision; do not silently relegate baseline features to “future optional.”

## 3. Exact semantics: message state and optimistic operations

### Send lifecycle

- Composer creates a **client operation ID** + temporary local message immediately. The item appears in current thread and inbox, with truthful queued/sending status and optional upload progress.
- Artefacts server returns an authoritative message ID and monotonic conversation ordering token only after durable commit + outbox intent; retry of the same operation is idempotent. Transport acknowledgement is **sent**, NOT delivered.
- A recipient-device acknowledgement, if supported and privacy-authorized, makes **delivered**; explicit reader cursor/read action makes **read**. If the engine cannot prove delivered, render Sent → Read directly, **never fabricate Delivered**.
- Temporary and committed messages reconcile into **one** row even when WebSocket notification arrives before HTTP response or multiple devices race. Retries preserve same logical identity and do not duplicate attachments.
- Failure shows actionable state + Retry / Cancel, retains text and attachment selection safely, never removes content silently. Offline compose is allowed; background automatic send is NOT promised until robust platform-specific durable queue and auth handling are implemented.
- Optimistically applying edit/reaction/recall/read/pin must keep a reversible previous value or authoritative reconciliation; denial/version conflict restores server truth and shows feedback. Wrong-user old responses must be discarded.

### Read, scrolling and navigation

- Mark read only when an authorized visible thread actually reaches/displays messages; prefetch, push receipt and hidden tab do not imply reading.
- Open another conversation without refetching entire app or remounting Workspace; keep scroll state and draft. On paginating backwards, preserve first visible message anchor. Incoming message does not auto-scroll if reader is viewing history.
- Optimistic inbox ordering cannot accidentally leak a private message into another Person/profile or an unrelated browser tab.

## 4. Exact semantics: destructive and privacy actions

**Delete for me:** per-account visibility tombstone for one message; no change for others. **Clear for me:** message history hidden up to an authoritative checkpoint and per-account; do not globally delete media that other members still reference. **Delete for everyone:** server-side authorization, redacted/tombstoned body and attachments no longer served by this product; previously downloaded/screenshot/backup content cannot be recalled. **Delete chat for both:** separately approved high-impact policy MSG13, opt-in action in direct chat only; not automatically allowed for received messages. **Edit:** sender-only by default; edit history visibility/retention policy decided before code. **Group admin:** may remove content only under explicit moderation powers, audited and communicated. Bulk operations and stale member actions are atomic/partial-success specified, with truthful results.

**Presence:** Online is per active eligible session with heartbeat expiry; precise last-seen timestamps are not sent to unauthorized viewers even if UI says “recently.” Coarse buckets are computed by backend/adapters from policy-authorized source data (no hidden precise timestamps in payload). Viewer privacy settings may restrict reciprocity, if approved. Typing never reveals online to blocked/hidden audiences.

**Whitelists:** an approved sender/contacts allowlist is a *delivery eligibility policy*, not an Access grant to Notes/Files/Artefacts. Block prevents direct chat initiation/send and unsolicited notification; existing group visibility rules need explicit policy and security tests.

**Defaults proposed, not yet owner-approved:** first contact outside contacts via request inbox, online approximate to noncontacts and precise only to contacts (configurable), read receipts enabled only for eligible contacts, push previews hidden by default, image optimized by default with explicit send-as-file. These are privacy-preserving initial recommendations **not silently approved configuration**. Resolve them via explicit decision before implementation.

## 5. UX contract (Chatify-based, Artefacts-integrated)

- **Desktop**: one column of conversations, active conversation next to it; filter/search/create chat in list header; sticky thread header and bottom composer; no permanent row of action buttons under every message.
- **Mobile/iPhone PWA**: one screen at a time, native-feeling back, safe-area/visualViewport keyboard adaptation, touch targets, swipe reply/archive only with equivalent non-gesture action, long press context menu, scroll anchoring, drag/select with accessibility fallback.
- Chat list rows show last visible preview, not “message decrypted” placeholder in Artefacts; PhotoBunker may show encrypted/unavailable states. Show participant/group avatars and permissioned activity states.
- Composer: text and emoji, attach (photos/files/camera), voice recording, reply/edit banner, draft state, send; full error and offline treatment. Outgoing pending messages never look read.
- Message item: grouping, time, clickable safe linked Resource preview, status ticks, reactions, context menu for Reply/Copy/Edit/Forward/Delete/Pin/Select; disabled commands explain why.
- Built-in sections are **inside Messages**, not new top-level Platform navigation presets. Global Shell toolbar/Workspace remain mounted. Theme uses host tokens for Artefacts or PhotoBunker; shared UI never forces Chatify branding/app layout.
- Every state has loading/empty/offline/error/no-permission counterpart. No fake contacts, sample messages or capabilities on production screens.
- Persistent user preferences for Artefacts may use normal server storage. **PhotoBunker private drafts/decrypted text cannot be persisted in plaintext**; its adapter enforces its own more restrictive storage and recovery policy.

## 6. Product and UX coverage cross-project

| Same reusable UI behavior | Artefacts adapter | PhotoBunker adapter |
| --- | --- | --- |
| Conversation list, thread, composer, optimistic queue, grouping, status visuals | Laravel Messages module over PostgreSQL HTTP + optional broadcast | Matrix event/timeline/SDK, no duplicate Laravel message table |
| Voice recorder + player | Platform Media attachment | Existing encrypted Matrix voice attachment workflow |
| Attach/photo gallery | Private Platform Media, server-side derived previews | Existing client-side E2EE photo/Matrix media rules; never plaintext server derivatives |
| Delete for me / recall / group permissions | Artefacts DB visibility/redaction policies | Matrix account data, redactions, room power levels and available keys |
| Search | server authorized search | client-only search over locally decryptable history |
| Read/delivered/presence | defined server-authoritative capabilities | only Matrix-guaranteed receipts, local E2EE and per-account policy |
| Notifications | Platform event to Notifications product | Matrix push/sync under device privacy boundaries |
| Private data/drafts | safe optional local/server preference policy | PhotoBunker no plaintext durable drafts without explicit separate security review |
| UI theme/navigation | Artefacts persistent Inertia Shell | PhotoBunker Vue Router PWA dock, its own login/key model |

**Do not copy PhotoBunker backend into Artefacts or copy Artefacts plaintext chat into PhotoBunker.** One UI/UX source, **two real privacy policies**.

## 7. Explicit exclusions from MSG baseline / separate decisions

- Federation, interoperability with public Matrix servers, SMS/telephony, paid message delivery, bots/AI assistants, public channels as chats, live streaming and end-to-end encryption of Artefacts are **not** implied by this spec.
- PhotoBunker existing Matrix E2EE is **not optional** just because shared UI supports Artefacts server messages.
- Voice/video calling MSG41 is a separately gated advanced feature (and PhotoBunker RTC failures must be resolved before claiming code reuse).
- GIF search via third-party service requires data-sharing, legal/ToS and tracking review; fallback can be installed local sticker/GIF packs.
- Strong privacy claims, retention, bilateral erase, legal content access, abuse response and E2EE require explicit policies, not UI labels.

**Next:** [MESSAGES-ARCHITECTURE](MESSAGES-ARCHITECTURE.md) translates this contract into shared Vue packages and separate adapters; [MESSAGES-ACCEPTANCE](MESSAGES-ACCEPTANCE.md) assigns actual PRs/tests. This documentation by itself does **not** start G8.S3 development.