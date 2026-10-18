# Domain Model, Vaults & Permissions
Статус: контракт сущностей и инвариантов; конкретные названия SQL-таблиц не предписаны.

Уточнение 2026-10-14: [14](14-identity-matrix-and-product-model.md) дополняет сущности постоянным публичным ID, User Profile, Contacts, Team и связью Account↔MXID. Историческое `Profile` ниже означает Camera Preset. Team/Assignment/Vault/Matrix room membership — отдельные разрешения.

## 1. Сущности
- **Account**: случайный непрозрачный ID, публичный(е) ключ(и), pseudonym optional, created_at, encrypted device/recovery key bundles, квота и статус; нет обязательного email, телефона, профиля личности.
- **Device**: ID/публичный ключ, encrypted device credential (если нужен), дата доверия и отзыва, capability; привязка возможна лишь после доказательства владения учётной записью.
- **Vault**: личный или совместный; ID, owner, crypto key epoch, encrypted title/settings, retention policy, server-visible quota/accounting fields, state active/locked/expired/deleting/deleted.
- **Membership**: account ID, vault ID, role, status, приглашение, права, key envelope per recipient/device/key epoch; сервер проверяет разрешения, но не хранит расшифровывающие ключи.
- **Profile**: в Vault, ID/version, encrypted rules + минимум необходимых server-visible ограничений, owner/curator.
- **Assignment**: конкретная задача, profile_snapshot/version, submitters, deadline (если нужен), review state.
- **CaptureSession**: текущий Vault/profile/category и локальная последовательность shot IDs; не нужна серверу для одного личного кадра.
- **Asset**: один original; immutable encrypted original, upload session, creator pseudonymous ID, capture timestamp if acceptable leakage or encrypted, absolute expires_at server-visible, revision manifest and lifecycle state.
- **AssetVersion**: derivative preview/render/export, encrypted editing manifest, writer, parent version, created_at; **всегда** связан с asset и его expiry.
- **MetadataRevision**: зашифрованный sidecar с описанием, категориями, GPS samples, выбранным location, capture time, evidence flag, версиями.
- **Share/Invitation**: opaque token ID, verifier/hash, wrapped capabilities/keys, expiry, scope, revocation.
- **UploadSession**: quota reservation, object IDs, signed short-lived upload instructions, idempotency key, last verified byte/status.
- **StorageObject**: immutable random storage key, encrypted byte count, kind, storage checksum, deletion status, last_attempt_at.
- **PaymentCredit**: anonymous invoice ID, exact credited bytes + paid-through duration, tx confirmation and ledger without storing full wallet identity.
- **DeletionJob/AuditEvent**: only operational metadata, no plaintext content or personal/location logs.

## 2. Правила владения
Каждый аккаунт имеет личный Vault; пользователь может создавать несколько Vault при соблюдении лимитов. Один и тот же asset не должен автоматически переноситься в другой Vault с прежними permissions. Копирование = новый encrypted object/envelope, новые права, TTL; при шеринге возможна отдельная shared capability без копии, но независимость TTL/ревокации должна быть явно определена.

## 3. Роли
- **Owner:** владелец Vault, задаёт участников, лимиты, профиль, TTL, ключи. Не может расширить тарифный срок.
- **Curator:** читает допущенные снимки и метаданные, редактирует, принимает/отклоняет, запрашивает пересъёмку; приглашение только по делегированному разрешению.
- **Contributor:** снимает/загружает; в режиме drop-only не получает ключи расшифровки истории Vault и чужих материалов. По настройке видит собственные снимки.
- **Viewer:** видит разрешённые материалы и версии; не редактирует.
- **Link recipient:** scoped token, без аккаунта, ограничение по времени и объектам.
- **Service operator/admin:** управление работоспособностью и квотами **без права чтения фото и ключей**.

Роли = server access control **плюс** наличие криптографического материала. Нельзя надеяться на одно из этих свойств отдельно. Read-only не гарантирует предотвращение экспорта/скриншота уже расшифрованного изображения.

## 4. Матрица разрешений
| Операция | Owner | Curator | Contributor | Viewer |
|---|---|---|---|---|
| Capture/upload | да | по профилю | да | нет |
| Read authorized files | да | да | только если выдан read | да |
| Edit/version | да | да | свои по настройке | нет |
| Annotate/review | да | да | ответы на замечания | нет |
| Modify profile | да | делегировано | нет | нет |
| Invite/remove members | да | делегировано | нет | нет |
| Change retention shorter | да | по разрешению | на своих фото в допустимых пределах | нет |
| Rotate/revoke keys | да | нет | нет | нет |
Серверная политика применяется ко **всем** write/read/URL выдачам; ciphertext privacy не заменяет ACL.

## 5. Инварианты
1. Asset не существует без Vault и owner-side cryptographic commitment.
2. Никаких публичных неконтролируемых bucket URLs. Ссылки на storage краткоживущие, каждый доступ проверяет авторизацию и expires_at.
3. Все оригиналы immutable, версии append-only; не перезаписывать исходник.
4. TTL child versions/sidecars/shares ≤ TTL asset и оплаченного Vault. Удаление parent каскадно запрещает доступ ко всем children.
5. Изменение профиля версионируется: старый снимок сохраняет profile_snapshot.
6. В drop-only режиме contributor может шифровать на публичный ключ Vault/получателя и **не должен** скачивать секретные ключи Vault.
7. Удаление участника останавливает будущую выдачу, а новая key epoch защищает будущие снимки; прошлые скопированные данные неотзывны. Для старых доступных ciphertext ключи и envelopes пересматриваются согласно threat model.
8. Метаданные поиска должны дешифроваться локально; сервер не индексирует plaintext tags/locations.
9. Операции обмена и версионирования идемпотентны и журналируются в минимальном объёме без содержимого.
10. Crypto protocol, schema и все payloads версионируются для последующих миграций.
