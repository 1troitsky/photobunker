# ADR 0003 — ключи, strong unlock и capture-only

Статус: предложено для review I02. Дата: 12 октября 2026.
Основание: [_docs/02](../../_docs/02-domain-model-and-permissions.md), [_docs/04](../../_docs/04-camera-capture-and-sync.md), [_docs/06](../../_docs/06-security-cryptography.md), [_docs/09](../../_docs/09-sharing-profiles-collaboration.md).

## Проблема и варианты

Камера после onboarding должна работать до PIN/reload, не открывая архив. Email/password scaffold и хранение E2EE root под коротким PIN нарушают контракт. Варианты strong unlock: высокоэнтропийный Recovery Key; сильная passphrase с reviewed KDF; platform-backed secret с проверяемыми capabilities. Базовый переносимый вариант — Recovery Key. Passphrase и WebAuthn PRF — отдельные opt-in ADR после device tests; PIN convenience не выдаётся за cryptographic unlock.

## Назначения ключей

Все пары генерируются независимо; auth/sign/encryption keys не конвертируются между алгоритмами и не переиспользуются по назначению.

| Ключ | Назначение и хранение |
| --- | --- |
| Account identity Ed25519 | Trust root для device certificates/owner key records; private seed только в encrypted recovery/device bundle и unlock memory |
| Account read-auth Ed25519 | PoP для read-capable session; отдельный certified key, private seed только в strong-unlocked memory/bundle |
| Account recipient X25519 | Получение Vault/per-object envelopes; private key только strong-unlocked/bundle |
| Vault recipient X25519 per epoch | Public key для capture; private key получают только участники с полным read scope этого Vault через account recipient envelopes |
| Device upload-auth ECDSA P-256 | Ограниченный PoP create/upload/status-own; non-extractable WebCrypto CryptoKey в IDB, никогда Vault read capability |
| Device capture-sign ECDSA P-256 | Подпись собственных capture manifests; отдельная non-extractable пара в IDB, certificate разрешает только capture/append-own/rewrap-own-pending |
| Device pending-recovery X25519 | Local-only envelope DEK своих pending captures; private key в strong-unlock bundle, public key доступен camera worker |
| Object DEK | Random независимо для каждого object; кратковременно в encryption worker, далее только sealed envelopes |

Narrower readers (selected asset/assignment/viewer) получают per-object DEKs, не полный Vault private key. Upload-only contributor не получает Vault private key даже для собственных уже отправленных фото. Own-pending recovery envelope остаётся локальным и удаляется после подтверждения/expiry; это явно ограниченная возможность восстановить свои ещё не доставленные кадры после strong unlock, не grant чтения общего архива.

Non-extractable auth/sign CryptoKeys не являются защитой от malicious same-origin JS или копии browser profile с OS capabilities. Их компрометация допускает ограниченные uploads/подписи до отзыва, но не расшифровку архива. Spike должен подтвердить structured clone/reload/sign и запрет `exportKey` на каждой платформе. Если сохранение таких ключей недоступно — cold capture требует повторной авторизации; raw signing private key в localStorage/IDB не становится fallback.

Account identity подписывает purpose-bound device certificate: account/device IDs, обе P-256 public JWK, pending-recovery public key, allowed statement types/scopes, certificate serial/revision/expiry. P-256 signatures используют WebCrypto ECDSA SHA-256, IEEE P1363 `r||s` 64 bytes; PHP verifier должен явно обработать этот формат и canonical field encodings. Подписанные records имеют собственный domain prefix + RFC 8785 JCS. Signature bytes не являются idempotency key или уникальным ID. Server scopes и membership проверяются при каждом запросе; сертификат не продлевает отозванный grant.

## Strong unlock и Recovery Kit

Recovery secret — random 32 bytes, не PIN/пользовательский пароль. Kit содержит version, opaque account/recovery IDs, identity public-key fingerprint и secret, показывается локально с подтверждением backup. Secret не передаётся API/URL/logs. Ошибки recovery не раскрывают различия между неверным key и повреждённым bundle.

Recovery KEK: `crypto_kdf_derive_from_key(32, 1, "PBRecov1", secret)`. Fixed 8-byte context и subkey ID закреплены для v1; парольный KDF здесь не нужен из-за случайного 256-bit input. Bundle — XChaCha20-Poly1305-IETF AEAD с random 24-byte nonce, canonical AAD (schema/account/recovery ID/revision/identity fingerprint). Private seeds, contacts/trust pins и pending-recovery secrets находятся внутри ciphertext. Основания: [libsodium KDF](https://doc.libsodium.org/key_derivation), [XChaCha20-Poly1305](https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction).

Сервер хранит ciphertext bundle и public auth records. Recovery загружает bundle, проверяет AEAD/identity pin, затем доказывает владение certified read-auth key. Recovery rotation создаёт новый secret/bundle, отзывает старые sessions, обновляет kit и подтверждение backup. Старый скачанный bundle с известным старым secret нельзя криптографически отозвать: при компрометации нужны identity/recipient rotation и отдельная политика re-encryption прошлых объектов.

Trusted device pin хранит максимальные известные certificate/bundle/epoch revisions; rollback ниже high-water mark отклоняется. Fresh recovery с устаревшим kit/bundle не умеет доказать отсутствие более новой версии у злонамеренного сервера: это documented rollback/availability risk, не решённый подписью или hash chain. Key transparency/independent witness не заявлены реализованными.

## Сессии и PIN

| Режим | Ключи чтения | Доступ |
| --- | --- | --- |
| Cold capture / cryptographic lock | Нет | Только verified public capture context и scoped upload/sign keys |
| Strong unlocked | В dedicated worker memory | Read auth и разрешённая decrypt/render работа |
| Warm PIN gate | Ключи ещё в worker memory | UI закрыт, decoded frames/URLs очищены; это UI barrier, не криптографическая граница |
| Reload / pagehide / hard lock | Worker уничтожен, read token забыт | Для чтения снова strong unlock |

Read tokens короткоживущие, только в memory, не в persistent cookie/localStorage. Capture token/session имеет отдельный scope и не обменивается на read token. PoP challenge содержит random одноразовый nonce, purpose, account/device, origin, scope и server expiry; consumption atomic, replay отвергается. Для full read нужен отдельный read-auth proof, upload-auth недостаточен. Аутентификация и decrypt capability проверяются независимо.

Engineering default для I04: мгновенно закрывать private UI на visibility hidden; hard lock на pagehide/reload/явный lock и после 5 минут inactivity. Background timers не гарантируются: deadline перепроверяется при resume до рендера/сетевых read. Изменение часов/неопределённость — hard lock. Warm grace/idle UX проверяется на устройствах до утверждения; скрытый decoded UI не остаётся в DOM. Живой key worker при warm gate нельзя называть отсутствием ключа чтения на устройстве.

## Аутентичность recipient key

Owner identity pin приходит из уже доверенного local account/recovery kit, device linking или сверенного приглашения. Capture bundle подписан owner authority и связывает Vault/epoch/public recipient key, membership grant, profile snapshot hash, ограничения и validity. UI до PIN хранит нейтральный alias, public key и минимум подписанных правил; приватные названия/история не добавляются.

Первый контакт с чужим owner требует TOFU с явным fingerprint; high-risk сценарий предлагает out-of-band сверку. Серверный public key сам по себе не подтверждает личность. На rotation проверяются owner signature, grant, монотонный epoch и предыдущий record hash. Сервер может удержать новый record; freshness/отзыв дополнительно проверяется при upload. Server substitution не проходит подпись закреплённого owner, но malicious hosted JS может обойти всю проверку — это остающийся риск web origin.

## Rotation и pending captures

Default: сервер не принимает новые finalize/sidecar writes на устаревший recipient epoch. Возврат — `409 key_epoch.changed`, сохранение local ciphertext до собственного expiry, UI `ACTION_REQUIRED`. Автоматического decrypt/rewrap в capture-only нет.

После strong unlock creator может открыть только local own-pending recovery DEK, проверить исходный manifest, получить authenticated current recipient key и подписать scoped rewrap statement (ADR 0002). Ciphertext/immutable encryption_epoch остаются прежними, recipient_epoch меняется; TTL и author остаются прежними. После revoke creator grant никакой rewrap не возвращает upload rights. Guest/drop-only без local recovery envelope должен повторить съёмку или явно экспортировать доступный ему исходник; неизвестные старые DEKs не восстанавливаются сервером.

Membership removal блокирует будущие server requests и меняет будущий epoch. Уже скачанные ключи/данные не отзываются. Ретроактивное ограничение требует явного re-encrypt всех затронутых объектов; копии у получателя остаются.

Bearer guest invites и автоматическое подтверждение guest sender keys требуют отдельного review I11: серверная регистрация ключа не заменяет owner certificate. До этого baseline — enrolled anonymous accounts с проверенной цепочкой подписей.

## Проверки и review gate

I03/I04: no plaintext private keys в persisted state; upload-auth не выдаёт read session; root/read/capture signing purpose swap; сертификат другого устройства/owner; pinned key substitution; replay challenge; denied raw key export; recovery wrong secret/identity/rollback; cold capture no private read key; hard lock/BFCache; epoch conflict, removed member и own-pending rewrap без grant чтения чужого. Spike подтверждает API compatibility, не готовность этих сценариев.
