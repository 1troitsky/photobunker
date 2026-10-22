# PhotoBunker — audit Chatify UI port and first-message failure
**Date:** 2026-10-22  
**Inspected state:** audit branch `45506b0723191d3c3cd2acc6bbd77fe0dd91bb92` = code at `main` `70b6fe5b98f563193cc5422b195d7bd65fd5afc6`, plus audit branch documentation changes.  
**Scope:** PR #7–#13, messenger routes, Matrix/E2EE prerequisites, first-message workflow, acceptance and UI fidelity.  
**Mode:** static source + GitHub CI/commit inspection. **No access to a running localhost:8080 instance, existing user sessions/keys or real devices. Do not claim reproducing the reported local click failure.**  
**Disposition:** **NOT ACCEPTED. P0 functional defect reported by owner; release stop until real chat creation/first message demonstrated.** No functional code or original documentation changed by this audit.

## Executive verdict

The PR chain **did add code** and several Chatify-attributed Vue components, but **did not replace the messenger UI with Chatify's actual product experience**. The existing PhotoBunker CSS/layout dominates, and most additions become visible only after a Matrix room opens. The user's statement that nothing useful changed is consistent with the diff and with an inability to enter the conversation.

The critical path has not been validated: main's [Local foundation run 39828023299](https://github.com/1troitsky/photobunker/actions/runs/39828023299) fails at `check-first-message.mjs` during **account setup**, before pressing Write, sending or receiving any message. Browser compatibility [run 39828023280](https://github.com/1troitsky/photobunker/actions/runs/39828023280) is green; it is not a messaging acceptance result. 200 Vitest tests and a Vite build succeeded in the failed run: they cannot substitute for a working DM.

## Findings and evidence

### P0-A. Deep-link «Написать» path silently stalls when Matrix identity isn't verified (confirmed logic defect)

**Files:** [PersonProfileView.vue#L46](https://github.com/1troitsky/photobunker/blob/audit/local-snapshot-2026-10-22/apps/web/src/views/PersonProfileView.vue#L46), [MessagesView.vue#L292-L330](https://github.com/1troitsky/photobunker/blob/audit/local-snapshot-2026-10-22/apps/web/src/views/MessagesView.vue#L292-L330).

From a public person's profile the Write action navigates to `/messages?peer=<id>`. The auto-open watcher does **nothing** until `security.verified && connection === 'ready' && diagnostic === 'ready'`. Consequently, in an unverified state `writeDirect()` isn't called and neither is its `readyToWrite()` recovery path, which otherwise opens the security sheet. The opening banner's fallback labels a ready-but-unverified state as “connecting.” This is a demonstrable missing state transition and insufficient feedback, not proof that it was the exact cause on the owner's existing account.

**Required fix:** Unconditionally handle the requested intent; separate loading, failed connectivity, device-key requirement, verifying, opening and ready states. Offer a specific recovery action without dropping the intended peer. Resume exactly once when verified; handle failure and cancellation visibly and without exposing keys.

### P0-B. Real «Новый чат → Написать» remains unverified (user-observed failure; exact local root not yet proven)

**Files:** [MessagesView.vue#L1045-L1068](https://github.com/1troitsky/photobunker/blob/audit/local-snapshot-2026-10-22/apps/web/src/views/MessagesView.vue#L1045-L1068), [MessagesView.vue#L303-L319](https://github.com/1troitsky/photobunker/blob/audit/local-snapshot-2026-10-22/apps/web/src/views/MessagesView.vue#L303-L319), [store.ts#L996](https://github.com/1troitsky/photobunker/blob/audit/local-snapshot-2026-10-22/apps/web/src/messages/store.ts#L996), [MessagingController.php#L44-L140](https://github.com/1troitsky/photobunker/blob/audit/local-snapshot-2026-10-22/apps/api/app/Http/Controllers/MessagingController.php#L44-L140).

The found-user button calls `writeDirect(publicId)`; `perform()` wraps `startMessaging()`, a trust gate and `createChat()`. The latter performs backend `/matrix/conversations/prepare`, Matrix room creation, `/matrix/conversations/activate`, waits for membership, and finally `openRoom()`. Backend can return 404/403/503, or the client can time out or fail crypto preflight. Multiple such states are mapped to a generic failed message, rather than a stage-specific user-facing explanation and recovery. There is no captured trace from the owner's localhost to determine which branch fails; do not invent a cause.

**Required diagnostic:** in a real **existing** user session, record non-sensitive state enums only: `connection`, `diagnostic`, `security.verified`, lookup result, click-handler invoked, HTTP status of prepare/activate, Matrix createRoom result status, and transition to `selected` and visible composer. **Never collect keys, access tokens, message bodies, user IDs or room IDs in logs.** Check both entry points separately.

### P0-C. Official `smoke` isn't a messenger smoke (confirmed false acceptance proxy)

**Files:** [scripts/dev](https://github.com/1troitsky/photobunker/blob/main/scripts/dev), [scripts/smoke.mjs#L7-L20](https://github.com/1troitsky/photobunker/blob/main/scripts/smoke.mjs#L7-L20).

`./scripts/dev smoke` checks `/`, `/gallery`, `/settings`, `/api/v1/health`, `/api/v1/ready` for HTTP 200 and headers. It does **not** open `/messages`, create a chat, send or receive text. A green result is service health only. Do not describe it as a passed messenger smoke.

**Required fix:** distinguish `smoke-infra` from `smoke-messenger`, with a real test fixture and verified account state, first-message ACK, receiver decrypted display, repeat navigation and error cases.

### P0-D. Full CI's chat suites are blocked behind unreliable account fixture (confirmed)

**Files:** [.github/workflows/ci.yml#L62-L75](https://github.com/1troitsky/photobunker/blob/main/.github/workflows/ci.yml#L62-L75), [check-first-message.mjs](https://github.com/1troitsky/photobunker/blob/main/tools/browser-spike/check-first-message.mjs), [account-qa.mjs](https://github.com/1troitsky/photobunker/blob/main/tools/browser-spike/account-qa.mjs).

The latest main run 39828023299 starts six scripts in one shell step. It fails at the first, `check-first-message.mjs`, stage `accounts` with `TimeoutError`; subsequent `check-messenger-ui`, `check-attachments`, `check-edit-reactions`, `check-messenger-ux`, `check-messages` never execute in that run. The failure does not establish that DM sending failed (it was not reached); conversely there is no green full messenger acceptance result for the merged state.

**Required fix:** isolate fixture/bootstrap validation, run essential paths in independently reported jobs, preserve non-sensitive stage diagnostics, stabilize fresh-account setup, test existing/legacy/unverified sessions. No required test can be skipped/masked by an unrelated fixture timeout.

### P0-E. Merged despite failing acceptance; branch not protected (confirmed release-process gap)

GitHub branch metadata for `main` reports `protected=false`. PRs #7–#13 are merged and the latest complete main Local foundation run fails. One green Browser compatibility spike is not a substitute. Require merge protection/required statuses or an equivalent enforced policy (review repository rulesets separately), including a real first-message gate.

### P1-A. This is a thin Chatify-derived component adaptation, not Chatify UI migration (confirmed)

**Before:** baseline commit `11af9c6`, `MessagesView.vue` 893 lines, about 53 KB.  
**After:** main `70b6fe5`, `MessagesView.vue` 1301 lines, about 68 KB.  
**Diff:** 15 `shared-ui` files **including license**, totaling ~691 added lines; +143 lines in `messages.css`; `MessagesView.vue` +500/-92 lines; full comparison 40 reported paths and 135 commits (some unrelated to visual UI).

`MessengerSplitLayout.vue` is merely an 11-line Vue slot wrapper. `ConversationSearch.vue` uses preexisting `messenger-search` styling. The “Chatify” composer here is ~5 KB and retains `message-composer`/`message-input`, unlike [upstream Chatify v2 Composer](https://github.com/munafio/chatify/blob/4a39eacb44e2405baa8c1e3bd3b4644fc5c8707d/frontend/src/components/thread/MessageComposer.vue) (~14 KB with its own floating composer, mode banners, menus, voice and sticker UI). Components share inspiration and attribution; they are not a faithful screen/UI port.

**Required product acceptance:** agree on visible reference screens and states; deliver desktop/mobile design comparisons for sidebar, new-chat dialog, real conversation, first-message, composer, media, empty/loading/error cases. Avoid claiming “Chatify installed” if upstream screen shell and visual language are not actually implemented.

### P1-B. Core chat is a prerequisite for seeing almost all new UX (confirmed)

The integrated `MessageComposer`, message bubbles, reaction actions, sticker picker, and media render inside the active joined, encrypted conversation path. If no room opens, the user sees the pre-existing empty state and only some sidebar controls. This makes the work effectively inaccessible until P0-B is fixed.

### P1-C. Diagnostic and failure semantics too generic (confirmed)

`perform()` in [MessagesView.vue#L560-L580](https://github.com/1troitsky/photobunker/blob/main/apps/web/src/views/MessagesView.vue#L560-L580) maps many different failed operations to `failed`, and `startMessaging()` collapses many boot exceptions into `diagnostic:...failure`, `connection=error`, `failure=failed`. Retain privacy but provide safe, meaningful non-secret failure states and a retry/recover route.

### P1-D. Product expectations exceeding present functionality

The adapted Composer has single-file attachments, offline emoji picker and a small locally rendered glyph-to-PNG sticker set. It is not Chatify's complete attachment panel, third-party sticker libraries, typing/presence UX, or a visibly distinct Chatify application. Matrix SDK launches with `disablePresence: true`, so don't assert a real online/last-seen implementation. Encrypted backend retained by design; no evidence that it must be replaced, and doing so would violate PhotoBunker's E2EE requirement.

### P2. Documentation stale

[docs/product/messenger-chatify-port.md#L4](https://github.com/1troitsky/photobunker/blob/main/docs/product/messenger-chatify-port.md#L4) still describes PB-U00 PR #7 as proposed and unmerged. This contradicts current main. Reconcile actual shipped capabilities and missing acceptance before further work. This audit branch intentionally contains documentation deletions; do not restore them automatically.

## Acceptance matrix before any more UX work

| Required check | Current evidence | Result |
| --- | --- | --- |
| Local HTTP health | `./scripts/dev smoke` checks shell/API status only | Health check, not DM |
| Vue component tests | 200 Vitest cases pass on main CI | Pass unit level |
| Vite / TypeScript build | CI main run builds successfully | Pass compile level |
| New-account fixture | First-message CI times out at accounts | Fail, blocks tests |
| Existing real account: profile Write → room | Owner reports no-op; guarded watcher confirmed | **Not accepted / P0** |
| Existing real account: New chat → user ID → Write | Owner reports no-op; stage of failure unknown | **Not accepted / P0** |
| First encrypted text sent/received/read | Not reached in latest CI | Unknown, not accepted |
| Chatify-style visual UI | Structural diff and components don't match full upstream experience | Not accepted |
| E2EE security and media regressions | Unit/source coverage exists; complete browser flow blocked | Partially tested |
| iPhone/Android physical PWA | Deferred by owner until final | Not tested, intentional |

## Non-destructive diagnostic instructions for local agent

Run against checked-out audit source with two existing or synthetic accounts in isolated browser profiles. Do not use a user's private photos or display/copy secrets.

1. Confirm loaded commit and `/messages` URL, capture viewport **with synthetic accounts only**; in an existing user's account do not produce screenshots without consent.
2. In DevTools, note only safe enums from `document.querySelector('.messages-screen')?.dataset`: `connection`, `cryptoStage`, `deviceVerified`. Do not report `data-room`.
3. Test **profile Write** with unverified and verified device: prove the UI displays an actionable recovery state immediately, then opens exactly one DM after verification.
4. Test **new chat Write** using the peer's exact public ID; record only HTTP **statuses** for `/matrix/conversations/prepare` and `/matrix/conversations/activate`, and transition stages. Do not capture request bodies or tokens.
5. Create room, send unique **synthetic** text, verify server ACK and receiver's decrypted display and read acknowledgement. Repeat with recipient not yet in messaging.
6. Test offline, slow responses, other tab holding Matrix lock, wrong ID, blocked peer, account switching, already-existing DM, unverified device. Every case needs a visible outcome.
7. Compare before/after rendered desktop/iPhone-size screenshots against agreed Chatify design references; track actual pixel/layout differences as well as accessibility.
8. Run all integration tests independently, then full CI; require no failures. Only after this review move to forwarding, remaining UX, reusable shared package and final physical devices.

## Ordered corrective plan (no speculative rewrites)

1. **P0, first:** fix route intent and security recovery dead-end; ensure error handling for every prepare/create/activate failure; recover while preserving requested peer. Tests for both Write entry points on existing accounts.
2. **P0, second:** stabilize account fixtures; extract first-message into mandatory isolated CI; add an actual messenger smoke. Require green CI before merging.
3. **P1, third:** deliver a coherent, visually inspectable Chatify-derived messenger layout across empty state/new chat/conversation, then test with screenshots. Keep Matrix E2EE and RTC functional.
4. **P1, fourth:** retest all present attachments, reactions, folders, sticker/picker UI only after the chat entry path works. Validate persistence/security claims.
5. **Then:** continue deferred forwarding and UI package extraction, run physical device PWA acceptance at the agreed final stage.

**Stop rule:** do not ship or claim messenger readiness while a test user cannot press Write, open a DM, and exchange an E2EE message. No further cosmetic PR should bypass this gate.
