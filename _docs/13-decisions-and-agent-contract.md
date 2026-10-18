# Agent Contract, Decisions & Glossary
Статус: инструкция агенту, который будет самостоятельно проектировать реализацию. **Это не roadmap.**

## 1. Что уже решено владельцем продукта
- PhotoBunker = небольшой независимый pet-project; надёжный, лёгкий, функциональный продукт без enterprise bloat.
- UI — устанавливаемая PWA через обычный URL, без обязательных Apple/Google app store или Capacitor.
- Camera-first default; альтернативный стартовый экран в настройках.
- Default без PIN для capture, но PIN на Gallery и Settings; варианты до камеры / отключить; учесть сильную криптоблокировку отдельно от PIN.
- Application silent shutter, никакого собственного звука и вибрации.
- No OS photos-gallery writes; допускается защищённая временная локальная очередь.
- Мгновенный capture UX; загрузка **не** гарантирована после закрытия PWA. Неотправленные фото и неточный GPS дают самостоятельные предупреждения.
- GPS acquisition before shutter + post-capture as encrypted separate metadata revision; явно показывать confidence/age/location source, никакой fake step-level precision.
- E2EE all images, versions, EXIF, descriptions, GPS and thumbnails. Admin/operator/provider not able to decrypt by design; open-source oriented/transparent implementation.
- Editor after cloud storage, supports text/draw/shapes/crop/brightness/contrast/saturation/privacy redaction, non-destructive revisions.
- Both personal and shared Vault, curator and contributor, profiles as capture rules; upload-only encrypted submission.
- Anonymous account without compulsory email/phone/name, high-entropy recovery.
- Free max retention 14 days; cheaper paid ~3 months, premium ≥12 months; shorter custom expiration as low as 1h; auto delete server side.
- Crypto prepaid storage, no automatic subscription, no permanent unlimited promise.
- No Ente API/fork/vendor-specific critical coupling; documented storage adapter.
- Roadmap is **not** to be added to these docs; implementation agent prepares PR decomposition separately.

## 2. Open engineering choices (do not pretend decided)
1. Exact encryption/wrapping protocol and auditable cross-browser key portability. Pick vetted crypto constructions, document test vectors, get review before shipping; **never** invent primitives.
2. Strong vault unlock experience across browsers with user-desired numerical PIN. Short PIN cannot be sole offline key protector. Clearly show when strong recovery/passphrase is needed, and why.
3. Browser still-photo capture path/quality matrix across iOS/Android. Performance and native camera parity are empirical questions.
4. First stable backend framework and package choice; proposed Vue 3+TypeScript client, PostgreSQL, thin Laravel-compatible API, S3 adapter — not a demand for needless stack complexity.
5. Initial tariffs GB/$, upgrade/downgrade merge semantics and prepaid entitlement calendar. Values in docs except Free 14d / cheap 3mo / premium ≥12mo are illustrative.
6. Payment chains/gateway, legal jurisdiction, refund policy, final verification thresholds. Monero privacy preference is a research direction, not implemented payment method.
7. UX exact PIN auto-lock timeout, location active window/threshold defaults, storage deletion worker SLO and backup residual retention; agent must propose measurable defaults and document trade-offs.
8. Role-based profile enforcement with encrypted fields: only authorized clients can validate encrypted requirements; service cannot assert verified compliance with unseen GPS. Agent must not implement impossible server validation.
9. Hosting CSP/client code attestation threat: hosted malicious JS can defeat client-side E2EE. Make deployment trust risks visible and consider reproducible releases; don't invent «mathematically impossible admin compromise».

## 3. Decision discipline
For every unresolved decision, first present: problem → options → security and simplicity trade-offs → chosen default and fallback → tests. Resolve choices without silently broadening scope. Changes to hard invariants require explicit owner discussion. Avoid interpreting «pet-project» as permission to ship unaudited encryption or deletion claims. Do not optimize for shorter code at cost of confidentiality.

## 4. Scope discipline
Reject unless explicitly approved: corporate CRM, task tracking beyond photo assignments, user behavior analytics, endless tariff combinations, fancy server AI/face recognition, public social network, rich report designer, complex multi-region Kubernetes, Docker as mandatory local dev, Electron/Capacitor as required install, blocking photo capture on GPS, server-side image processing.
Opt-in future extensions must leave simple private Vault experience untouched.

## 5. Glossary
- **Vault:** top-level encrypted personal/shared space with owner, ACL, policies, storage allocation, key epoch.
- **Profile:** reusable set of capture requirements, not folder.
- **Assignment:** particular use of profile with participants and review.
- **Session:** short-lived local capture context to avoid repetitive forms.
- **Asset:** one immutable encrypted captured original, subject to TTL.
- **Version:** encrypted non-destructive edit or export/preview derivative.
- **Metadata revision:** encrypted sidecar for GPS, tags, captions, evidence timestamps.
- **Recovery Kit:** high-entropy user-held account-key recovery material.
- **PIN gate:** local convenience lock; not equivalent to E2EE secret protection.
- **LOCAL_COMMITTED:** safely queued encrypted on device subject to PWA eviction; not yet in cloud.
- **CLOUD_CONFIRMED:** object integrity verified and server transaction finalized.
- **expires_at:** authoritative server deadline for active access; physical deletion later verified.
- **E2EE:** only sender/authorized recipient holds decrypt capabilities; server merely routes ciphertext.

## 6. Documentation precedence
Актуальная модель аккаунта, терминология, Matrix и навигация определяются [14](14-identity-matrix-and-product-model.md) по документам владельца от 14 октября. Последнее указание владельца задаёт UX/UI-first порядок в `IMPLEMENTATION_PLAN3.md`; старые планы исторические. Требования 06/07 и запрет ложных security claims сохраняются. Текущий репозиторий уже содержит работающие camera/storage/tests: не считать его пустым и не переписывать без продуктовой причины.

01 overall product intent; 06 security hard rules; 07 deletion/expiry; 02 permission invariants; 04/05 camera+GPS lifecycle; 08 editor; 09 sharing; 10 plans; 11 API; 03 UX; 12 acceptance. If descriptions seem contradictory, choose more restrictive confidentiality claim and surface discrepancy; do not silently omit requirements.
Each PR agent prepares should point to changed docs, exact acceptance cases and threat implications. No code should depend on undocumented private vendor API.

15 октября 2026 владелец явно разрешил U04 и B01: подключены Identity API и локальный Tuwunel по ADR 0006. UI-first не запрещает backend уже одобренного B01. Recovery signing key не является E2EE/photo/Matrix backup; перенос libraries требует явного доказательства и отдельной миграции B03/B04. Не считать локальные фото автоматически принадлежащими подключённому аккаунту.


Следующий этап после исправления анкеты — B02, подключён локально 15 октября 2026 по ADR 0007: SDK/Rust, one-owner crypto DB, E2EE переписка и отдельный ключ истории Matrix. PB1 остаётся credential входа. Выход удаляет Matrix device; новый вход имеет новый crypto epoch и восстанавливает историю её ключом. [Фактические проверки и ограничения](../docs/operations/matrix-messaging.md). Account/Team/Assignment/Vault grants и фото E2EE остаются B03/B04; production release guard не снят.

B03 (2026-10-15) explicitly authorized by the owner: account-owned teams/tasks/Vaults, real invitations, server photo grants, encrypted assignment discussions and explicit source-preserving import. [ADR 0008](../docs/adr/0008-account-workspace-and-assignment-discussions.md), [B03 boundaries](../docs/operations/account-workspace.md). Matrix membership never grants photo access. Photos remain plaintext until B04; the production guard stays.
