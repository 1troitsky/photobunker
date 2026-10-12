# ADR 0002 — формат зашифрованных объектов v1

Статус: предложено для review I02, не production protocol. Дата: 12 октября 2026.
Основание: [_docs/06](../../_docs/06-security-cryptography.md), [_docs/11](../../_docs/11-architecture-api-contracts.md). Key lifecycle: [ADR 0003](0003-keys-unlock-and-capture.md).

## Проблема и варианты

Нужны переносимые immutable objects, ограниченная память при обработке больших снимков, authenticated context и capture-only encryption. Сервер получает ciphertext, технические IDs/размеры и сроки, без изображения, EXIF, MIME/name, GPS, описаний или editor/profile payload.

| Вариант | Компромисс |
| --- | --- |
| WebCrypto AES-GCM для каждого chunk | Native API, но приложение отвечает за уникальность nonces, sequence binding и finalization; отдельный protocol review обязателен |
| Libsodium secretstream + sealed boxes | Стандартный file encryption API и public-key wrapping; дополнительные JS/WASM bytes и проверка CSP/мобильной памяти |
| Один AEAD вызов на весь файл | Проще framing, но требует нескольких больших buffers; не основной путь для фото |

Выбран libsodium `crypto_secretstream_xchacha20poly1305` для всех object kinds, включая небольшие sidecars. Каждый объект получает независимый random 32-byte DEK. Для получателей — `crypto_box_seal`: это X25519/XSalsa20-Poly1305 construction, а не secretstream и не подпись отправителя. Основания: [file API](https://doc.libsodium.org/secret-key_cryptography/secretstream), [sealed boxes](https://doc.libsodium.org/public-key_cryptography/sealed_boxes).

Fallback при неприемлемой browser support — отдельный reviewed WebCrypto suite/version; никаких скрытых downgrade или собственных nonce schemes. Spike проверяет готовые library APIs, не реализует этот wire format.

## Предлагаемый wire format

Canonical JSON — UTF-8 [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785), без duplicate keys, lone surrogates, unknown fields и нецелых/unsafe integer counters. UUID — lowercase canonical UUID, bytes в JSON — base64url без padding, byte lengths — decimal strings без ведущих нулей. В I03 нужен поддерживаемый canonicalizer и RFC vectors; обычный `JSON.stringify` не заменяет JCS.

Файл: `ASCII("PBOBJ001") || u32be(descriptor_length) || descriptor_JCS || sodium_header || frames`. Descriptor ≤64 KiB. Frame: `u32be(ciphertext_length) || ciphertext`; длина проверяется до allocation. Secretstream header/overhead берутся из library constants и проверяются против v1 suite. Frame size по умолчанию 1 MiB plaintext, кроме последнего. Пустой объект содержит один пустой FINAL frame. Максимальный encoded object для первой реализации — 64 MiB; отдельный лимит small metadata — 256 KiB. Это engineering defaults, не обещание качества камеры.

Public descriptor содержит только `format="pb-object"`, `version=1`, `suite="sodium-secretstream-xchacha20poly1305"`, `vault_id`, `asset_id`, `object_id`, `kind`, `object_revision`, **`encryption_epoch`**, `chunk_bytes`, `plaintext_bytes`, `frame_count`. Допустимые kinds: original, thumbnail, metadata, edit-document, derivative, profile. Profile использует собственный opaque aggregate ID в поле `asset_id`. Размер plaintext видим технически и почти выводим из ciphertext; padding в v1 не обещается.

`H` далее означает BLAKE2b-256 через `crypto_generichash(32, ...)`. AAD каждого frame: `UTF8("photobunker/object/v1\0") || H(descriptor_JCS) || u32be(frame_index) || u32be(plaintext_frame_length)`. Index начинается с 0. Library управляет nonces/rekey; приложение не задаёт nonce для stream frames.

При decode необходимо одновременно проверить ожидаемый context из авторизованного запроса, descriptor hash из подписанного manifest, ограничения длины/count, ordered frames, MESSAGE tags до последнего и ровно один FINAL в конце. Отсутствие FINAL, лишние bytes/frames, mismatch total length, чужой object/kind/revision/epoch — отказ. Непроверенный partial output не показывается и не сохраняется как успешный файл. Decoder не возвращает success до FINAL и проверки ciphertext digest. Decode работает с bounded chunks; изображения затем могут требовать значительно больше памяти при browser decoding.

## Envelopes и подпись

Sealed envelope plaintext: DEK + descriptor hash + object context + recipient public-key fingerprint + **`recipient_epoch`** + envelope schema version. После открытия все поля сравниваются с ожидаемым context и подписанной envelope statement. Непроверенный public key из ответа API не становится recipient key.

Transport manifest содержит descriptor hash, ciphertext digest/bytes, object context, capture grant/certificate digest, signer ID и hash первоначального envelope set. Подпись — отдельная, purpose-bound, над canonical manifest с prefix `photobunker/object-manifest/v1\0`. Device signing/certificate algorithms указаны в ADR 0003. Подпись доказывает происхождение от допущенного ключа, не истинность GPS/времени/сцены. Сервер проверяет подпись/размеры/scopes, читатель дополнительно проверяет trust chain, envelopes и AEAD.

`encryption_epoch` файла неизменяемый. `recipient_epoch` wrapping layer может измениться после rotation. Rewrap statement связывает hash исходного подписанного manifest, новые envelopes, recipient epoch, возрастающую wrapping revision и authorizing grant. Исходная подпись сохраняется. Нельзя переписать epoch в descriptor без нового шифрования. Rewrap не продлевает TTL и не меняет автора/asset ID. Реализация и проверки rewrap относятся к I03/I06.

Original, thumbnail, GPS sidecar и editor revision — разные DEK/objects. Thumbnail шифруется, пока plaintext capture ещё в памяти. Поздний GPS может создать новый sidecar на public recipient key без старого DEK и без чтения оригинала. Sidecar append имеет собственный opaque revision ID; optimistic merge разрешён читающему клиенту, не capture-only uploader.

## Review и критерии до пользовательских данных

- I03: RFC canonicalization vectors, native libsodium ↔ browser fixtures, wrong recipient/key/AAD, descriptor/asset/kind/revision/epoch swap, malformed lengths, truncation, reorder, duplicate, appended frames, FINAL misuse, ciphertext/envelope signature tamper.
- Отдельно: limits до allocation, cancellation/lock в середине stream, worker cleanup и отсутствие private output в IDB/CacheStorage/logs. JS memory cleanup — best effort.
- Этот документ и primitive spike не являются аудитом или доказательством безопасности композиции. До реализации продуктового codec нужен review wire format; до публичных обещаний audited E2EE — независимый security review.
- Открытые release gates: реальные iOS/Android, full codec vectors, review key certificates/rewrap и supply-chain/release CSP. Hosted malicious JS остаётся угрозой.
