# MatrixRTC calls — local operations

B06 connects PhotoBunker's existing encrypted Matrix conversations to LiveKit media, using matrix-js-sdk 44.0.0, livekit-client 2.22.4, LiveKit 1.13.10 and official lk-jwt-service 0.9.0. Images are pinned by digest. [Decision](../adr/0012-matrixrtc-livekit-calls.md), [admission contract](../../contracts/rtc-api.md).

## Start

```sh
./scripts/dev matrix
./scripts/dev rtc
```

`rtc` preserves existing matching API/SFU secrets, generates ignored private config and a dedicated local TLS CA, starts internal authorization/OpenID/SFU services, applies migrations and reloads gateway. Private material stays in `.env`, `apps/api/.env` and `infra/rtc/.local/`; never paste these files, JWTs or OpenID URLs in reports. No host PHP/Composer or global LiveKit install is required.

Open Messages in two accounts, configure protected messaging history, create/accept an encrypted chat and use its phone/video actions. Answer explicitly on the other device. Mic/camera toggle independently; end stops local capture immediately, including during a dependency outage. Navigation asks to end the call. PIN lock, account switch, logout, page exit and device revoke end capture. Incoming invitations are available while Messages is open; suspended/closed PWA incoming calls are not implemented.

## Topology and bounds

This is a **loopback development lab**: same-origin `/rtc/sfu/` WebSockets, ICE TCP 7881 and UDP 7882 bound to 127.0.0.1. SFU HTTP/admin port 7880, JWT service and Matrix OpenID TLS proxy have no host port. Private TLS trust is explicit; no certificate-validation bypass. Browser ICE config suppresses public STUN discovery. Maximum 16 participants per room; two-hour admission lifetime, 10-second heartbeat, 45-second abandoned-client cutoff. No recording, egress or media persistence.

TURN is not needed for the measured host-loopback path. Production/phone access requires the actual deployment IP, trusted HTTPS/WSS, UDP/TCP routing and tested TURN/TLS fallback, including cellular/enterprise NAT. Current configuration does not advertise reachability from another physical phone. Do not expose these Docker ports/secrets as a production deployment. Physical iPhone/Android, Safari/PWA background behaviour and production NAT/TURN remain R01.

Tuwunel 1.9.4 does not advertise delayed events; the SDK uses its legacy state-event fallback with 30-second membership expiry and explicit leave. Server admission/heartbeat/removal independently reconcile lost clients. Media keys come from SDK MatrixRTC and encrypted Olm to-device transport, then feed LiveKit's standard key provider/worker. Unsupported media-encryption APIs fail closed; no unencrypted fallback is offered. A transient receiver missing key must wait for its encrypted delivery while encrypted frames are dropped.

Never inspect full rtc-jwt/LiveKit logs during authentication failures: upstream error chains can include tokens. Both containers use Docker logging `none`; RTC proxy access/error logs are suppressed. Diagnose with fixed status codes and counts. Local schema/admission tests use synthetic state, keys and claims. Browser fixtures retain recovery material only in memory and deactivate only fingerprint-matched accounts.

## Checks

```sh
./scripts/dev check
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/photobunker-playwright-browsers node tools/browser-spike/check-calls.mjs
```

Linux/CI browser path is `/tmp/photobunker-playwright-browsers`. Chromium uses synthetic camera/microphone. `CALL_BROWSERS=webkit` runs the same scenario where the installed WebKit supports capture/E2EE; a desktop engine result does not prove a physical phone. QA must prove actual remote video decoding and compare with a receiver that has no keys, rather than infer E2EE from a lock icon or encrypted Matrix room. Results are recorded below only after execution.

## Executed results — 16 October 2026

Chromium full call QA passes against real local Matrix/Laravel/LiveKit: direct video/audio, independent mic/camera toggles, actual remote decoded video, nonzero inbound audio energy, signalling reconnect using the refreshed SFU admission, group audio/video with three accounts, 320/390/768/1440 px chat/call layouts, explicit end and ended capture tracks. A separate authorized SFU receiver with no MatrixRTC key receives video bytes but decodes zero frames; joining properly receives keys and decodes media. Foreign-room admission is denied. Denied capture and dependency 503 show visible errors; decline keeps the caller active; app PIN stops capture, unlock permits a fresh call, active device revoke disconnects and stops capture. No runtime errors/unhandled rejections in the call scenario.

WebKit compatibility is **open**, not passed: API/media-encryption feature detection succeeds, Matrix admission and same-origin signalling succeed, but the local peer connection does not establish (`ConnectionError`, InternalError; ICE gathering completes and the connection is closed after failure). Canvas/oscillator synthetic capture plus explicit media permissions did not establish a call. No plaintext fallback was enabled to pass the test. This result does not identify physical Safari/iPhone behaviour or prove a specific NAT/codec cause. Test the real deployment network and physical devices before claiming support. The Chromium result proves the loopback media path; transport-specific ICE/TCP and TURN/TLS fallback are not yet certified.

The shared checks pass: 93 API tests / 1370 assertions, Pint 103 files, private/presigned S3 checks, 109 client tests, TypeScript/production build. Browser B02 messaging/SAS/cross-signing/backup/recovery/live revoke/account-switch regression passes in Chromium and WebKit; WebKit reports five known native cancelled-photo-poll diagnostics, with zero JavaScript window errors/unhandled rejections. Build retains the existing large SDK chunk warning; LiveKit adds a lazy SDK chunk (~587 KB raw / 155 KB gzip) and ~101 KB media worker. No physical-device performance claim.

RTC API tests include original/refreshed JWT denial after logout, device/Identity binding, room membership/encryption/foreign-member/blocks, upstream privileged-grant rejection, stale heartbeat, failed-removal retry, old/new call serialization and revoke committed while Matrix authorization is pending. Client lifecycle tests cover offline teardown, late admission/capture cancellation, denied/unsupported capture and key-delivery timeout.

`./scripts/dev down` includes prepared RTC containers and preserves named volumes. After switching the lab to `offline` and back, run `./scripts/dev rtc` again to start its private media services. Vite polls bind-mounted files in development because native Docker file notifications were observed to miss changes; this is separate from production assets.
