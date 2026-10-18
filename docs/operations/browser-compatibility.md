# I02 — браузерная матрица и ручной протокол

Стенд: [tools/browser-spike](../../tools/browser-spike/README.md). Решения: [ADR 0002](../adr/0002-object-encryption-format.md), [0003](../adr/0003-keys-unlock-and-capture.md), [0004](../adr/0004-retention-clock-access-and-restore.md), [0005](../adr/0005-browser-probes-and-local-queue.md). Нормативные acceptance: 12.C/D/F/I/K; пользовательские сценарии ещё не реализованы.

## Уровни подтверждения

PASS означает только проверенный столбец на указанном engine/environment. API присутствует ≠ сценарий работает; desktop WebKit ≠ iOS Safari; clean process restart ≠ crash mid-write; strict transaction ≠ guaranteed persistence; синтетический JPEG ≠ EXIF orientation реальной камеры.

| Среда | CSP/WASM + sodium worker | IDB Blob/job commit/abort/reload | P-256 IDB + browser restart | Физическая камера / installed PWA |
| --- | --- | --- | --- | --- |
| macOS arm64, Playwright Chromium 156.0.8078.4 (1248) | PASS | PASS | PASS | physical pending; fake Canvas/stop PASS |
| macOS arm64, Playwright Firefox 157 (1555) | PASS | PASS | PASS | pending; fake test skipped |
| macOS arm64, Playwright WebKit 27.2 (2370) | PASS | PASS в постоянном profile; ephemeral Blob отказ | PASS в постоянном profile | pending; fake test skipped |
| Ubuntu 24.04 CI, те же три desktop engines | PASS | PASS в постоянных profiles; WebKit ephemeral Blob отказ | PASS | physical не проверяется; fake Chromium PASS |
| Реальный iPhone, Safari tab | pending | pending | pending | pending |
| Реальный iPhone, Home Screen PWA | pending | pending | pending | pending |
| Реальный Android, Chrome tab | pending | pending | pending | pending |
| Реальный Android, installed PWA | pending | pending | pending | pending |

## Автоматические проверки

Измерено 12 октября 2026 на macOS arm64, Node 22.23.3, Playwright 1.64.0: **10 tests passed, 2 skipped**, retries=0. Libsodium wrapper 0.8.4 сообщает core 1.0.22; production worker bundle — 435.33 kB без сжатия. Это размер JS bundle, не peak RAM и не аудит библиотеки/композиции.

В ephemeral/private context WebKit на этом Mac первая Blob transaction завершается `UnknownError`; после abort отсутствуют и Blob, и job. Ubuntu CI также выявил отказ ephemeral Blob commit. Negative test на обеих средах требует именно `UnknownError` и проверяет отсутствие ложного commit. Отдельный тест в постоянном profile обязан пройти все восемь probes и реальный process restart на каждом engine. Отрицательный результат относится к указанным средам; он не доказывает поведение приватного Safari на всех устройствах. UI сообщает save failure, silent fallback отсутствует. Результаты текущего commit доступны в [checks PR №3](https://github.com/1troitsky/photobunker/pull/3/checks).

`npm test` в package стенда запускает production build/preview под CSP и три Playwright projects. Для каждого engine в постоянном profile: ready/worker roundtrip на 8 MiB bounded chunks, tamper и wrong-recipient denial как primitive sanity checks; 4 MiB synthetic Blob/job atomic commit/readback/hash; abort после успешного put; non-extractable key sign/verify/export denial после process restart. Ephemeral context дополнительно проверяет reload либо описанный storage denial; negative WASM policy, отсутствие внешних requests, ошибок browser console и camera request проверяются отдельно. Это не cross-language codec vectors/security review приложения.

Chromium дополнительно получает fake camera, измеряет Canvas и подтверждает stop всех tracks. Firefox/WebKit camera test явно skipped, не считается PASS. Test retries выключены; фиксированные package/browser revisions в lockfile. Peak memory, power-loss, storage eviction, race на physical device и mobile OS lifecycle данным suite не подтверждаются.

## Ручная проверка устройства

1. Подготовить trusted HTTPS origin стенда, доступный телефону; указывать localhost Mac на телефоне нельзя. Записать OS/browser version, hardware model без serial/идентификаторов, tab или installed mode, дату и commit harness. Если HTTPS/доступность не готовы, результат pending, не менять browser security flags.
2. На чистом origin запустить synthetic probes без camera permission. Скачать JSON явно. Проверить CSP/WASM, обе IDB records, abort и key clone; `persist()` нажать отдельно и записать как granted/denied/unsupported. Reload, закрытие/reopen и перезапуск браузера проверять отдельно.
3. Навести камеру на test card: текст UP, разные углы/цвета, без людей/GPS/личных предметов. Явно разрешить camera. Измерить video settings и takePhoto (если доступен), затем Canvas. Повторить front/back через browser/device controls; lab пока не предоставляет переключатель камеры.
4. Повторить portrait/landscape и поворот между preview и capture. Сопоставить decoded dimensions с video settings и фактической ориентацией карточки. Одни width/height не подтверждают EXIF orientation; визуальная/инструментальная проверка native still остаётся обязательной для I05. Forced platform sound и privacy indicator не обходить.
5. Увести приложение в background и вернуться, закрыть вкладку/приложение и открыть снова. Проверить, что camera indicator погас, tracks не продолжаются после hidden/pagehide, старый preview очищен. Report events — лишь вспомогательное наблюдение, не обещание background timers.
6. В device tools измерить worker и decode peak RAM на 4/8/32/64 MiB synthetic fixtures и encoded test-card still, cancellation и влияние memory pressure. Текущий lab автоматизирует 4 MiB storage / 8 MiB stream; большие sizes, 20 кадров и kill mid-write будут отдельным расширением I05 после выбора codec. Не считать фиксированный chunk size измерением peak RAM.
7. Проверить denied camera/storage, private mode, full quota и eviction отдельно на одноразовом profile. Не заполнять рабочее хранилище пользователя автоматическим stress test. Текущий abort probe не имитирует quota exhaustion или OS kill.
8. Очистить только lab database, убедиться, что камеры выключены. Приложить минимальный local JSON + таблицу результатов к review по явному действию владельца; стенд ничего сам не отправляет.

## Review protocol до I03

Внутренняя сверка решений с `_docs/02/06/07/11/12` выявила и уточнила четыре границы: sealed box не удостоверяет отправителя (отдельный certified signing key); immutable encryption epoch не меняется при recipient rewrap; старый recovery bundle с известным secret нельзя отозвать; TTL от upload/нового anchor создавал бы продление и поэтому запрещён. Это design review автора изменений, не независимая проверка. Полная спецификация canonical certificate/envelope/manifest bytes и cross-language vectors должна пройти следующий protocol review до product codec.

| Область | Что проверить | Статус |
| --- | --- | --- |
| Crypto format | canonical bytes, framing/AAD, FINAL/length limits, signed manifest, wrong context, purpose separation | ADR предложен; codec vectors pending |
| Wrapping/epochs | immutable encryption_epoch отдельно от recipient_epoch, scoped own-pending recovery, revoke не возвращает grant | ADR предложен; implementation/security review pending |
| Recipient authenticity | pinned owner key, device certificate, TOFU/OOB, replay/high-water mark, fresh-device rollback limits | ADR предложен; independent review pending |
| Unlock | Recovery Key baseline, PIN только UI, no persistent read token/private key, unsupported CryptoKey fallback | ADR предложен; device + UX/security review pending |
| Retention | stale anchor не продлевает TTL, clock uncertainty, Calendar UTC/clamp, read gateway, current deletion ledger до readiness | ADR предложен; I08 tests pending |

I02 даёт reviewable решения и воспроизводимый spike; не помечает эти gates закрытыми без доказательств. До product codec I03 нужно разрешить format/key-lifecycle review findings; до заявления о надёжности capture — пройти реальные iPhone/Android. Независимый аудит не выполнен и не подразумевается desktop tests.

## Приложение U04/B01, 15 октября 2026

Отдельные сценарии приложения `check-account.mjs` проходят в Chromium и WebKit: реальный signed account/recovery, field visibility, contacts/block, Tuwunel provisioning/login/whoami, logout/login и device revoke. Chromium также подтвердил cold Matrix restore и outage/retry. `check-camera.mjs` прошёл реальный getUserMedia → ImageCapture → IDB → повторное открытие на **синтетической** камере Chromium (3840×2160), с остановкой tracks. Это не меняет pending-статус физических телефонов. [Camera contract/checklist](camera.md), [Identity/Matrix runbook](identity-matrix-local.md).


15 октября 2026: B02 `check-messages.mjs` прошёл в Chromium/WebKit — Rust/WASM, реальные E2EE DM/group/reply/read/SAS, backup/recovery на новом устройстве, неверный ключ, encrypted-store reload, один crypto owner, offline/reconnect, logout с новой Matrix identity, live revoke, decline заблокированного приглашения и отмена при смене аккаунта. `check-profile-save.mjs` подтвердил name/username с пустым Email, reload, видимую ошибку/повтор и истёкшую сессию на обоих engines. Проверки выполнены на localhost, не на физических телефонах; [границы B02](matrix-messaging.md).

## B03 account workspace (2026-10-15)

`check-workspace.mjs` passed in Chromium and WebKit with real Identity/Matrix/S3: team/task invitations, upload-only, separate 80px thumbnail, private encrypted discussion and ID-only references, current ACL/revoke, source-preserving S3/device import and retry, TTL, full-to-thumbnail downgrade, cross-tab isolation and 320-1440px layouts. New local binary records use byte buffers with backward-compatible Blob reads after a reproduced WebKit IDB UnknownError/stalled Blob write. U03 API-unavailable regression passed in both engines. Physical iPhone/Android and installed-PWA lifecycle remain pending. [B03 details](account-workspace.md).


## B04 photo protection (2026-10-15)

Application suites `check-photo-crypto`, `check-photo-workspace`, `check-photo-recovery`, `check-photo-offline` pass in desktop Chromium/WebKit against real local Identity/Matrix/S3 and the dedicated libsodium worker. Covered: PB1 authority binding/PB4 backup/strong cold lock, ciphertext queue and ACK buffer/pending-envelope removal, owner-reviewed recipient plans, upload-only and independent 80px keys, review/response signer separation, Megolm ID-only references, immediate photo and Matrix revocation, unchanged ciphertext/deadline on pending rewrap, explicit migration/readback/local versions/separate cleanup, metadata/manual GPS, PIN five-attempt hard lock, PB4 rotation/history/new-device linking, cold API outage capture with no plaintext fallback and clock/resume expiry. Public shell remains online in the outage drill; this is not full offline PWA or physical-device proof. U03 API-unavailable regression passes in both engines and synthetic hardware capture passes in Chromium. [Exact boundaries](photo-protection.md).

B04 rerun note: an extra WebKit basic pass produced one unexpected native `pageerror` while photo delivery/readback succeeded, with no window error or unhandled rejection. The diagnostic rerun passed; no new error suppression was added. [Recorded limitation](photo-protection.md). Full B02 messaging/recovery and profile save/session-expiry regressions pass on both engines after the account-form lifecycle fix.

## B06 calls (2026-10-16)

Chromium call QA passes with real local SFU and synthetic capture: direct/group encrypted audio/video, decoded remote frames and audio energy, no-key receiver with bytes but zero decoded frames, reconnect, mute/camera/end, PIN/rejoin and device revocation. WebKit media APIs exist but the tested loopback peer connection fails; WebKit/Safari call support remains open, independently of the passing WebKit E2EE messaging regression. Physical phones, production NAT/TURN/TLS, transport-specific TCP fallback and suspended/closed PWA incoming calls remain unverified. [Exact scope and results](matrixrtc-calls.md).
