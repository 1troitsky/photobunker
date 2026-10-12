# ADR 0004 — сроки, доступ и restore без воскрешения

Статус: предложено для review I02. Дата: 12 октября 2026.
Основание: [_docs/07](../../_docs/07-storage-retention-deletion.md), [_docs/12.I](../../_docs/12-quality-acceptance-and-operations.md).

## Проблема и варианты

Нужен срок до часа от съёмки, включая delayed/offline upload, без доверия к client wall clock. Отозванный объект не должен ожить из snapshot. Варианты: TTL от первого upload (продлевает жизнь offline снимка); доверие client timestamp (можно подделать); conservative server time anchor + local estimated age (раньше истекает при неопределённости). Выбран третий. Точное trusted offline время на обычном браузере недоступно; невозможно доказать реальное время съёмки или принудить уже получившего plaintext пользователя удалить копию.

## Deadline и часы

Client capture сохраняет encrypted wall-clock timestamp, monotonic offset и ID последнего authenticated server time anchor. Capture context включает server-issued `issued_at`, `retention_not_after`, grant expiry и plan/policy bounds. До capture UI показывает ожидаемый остаток срока; offline deadline обозначается оценкой.

Local expiry — duration от capture по monotonic elapsed в текущем runtime плюс conservatively checked wall-clock elapsed. Jump/rollback, смена timeOrigin/reload, suspend с сомнительной continuity — `CLOCK_UNCERTAIN`. Никакое отрицательное elapsed не увеличивает остаток. На resume до upload/decrypt выполняются expiry/clock checks. Закрытая PWA не запускает обязательный timer: физическая очистка local IDB выполняется при следующем исполнении, logical expiry не переносится.

Сервер не принимает client timestamp/elapsed как доказательство. Консервативный deadline:

`min(anchor.issued_at + requested_duration, capture_context.retention_not_after, entitlement_end, vault_policy_deadline, explicit_delete_at, parent_expires_at)`.

Anchor должен быть выдан этому grant до capture и включён в исходный подписанный manifest; нельзя заменить его свежим anchor при retry/rewrap. Это upper bound жизни объекта: старый offline anchor сокращает доступный срок, особенно в режиме 1h. Online клиент обновляет anchor перед активной сессией (кандидат freshness 60 секунд); capture не ждёт server refresh. Если anchor window уже истёк, локальная съёмка не превращается в обещание облачной доставки: ciphertext может быть локально зафиксирован, upload запрещён, UI явно показывает `ACTION_REQUIRED`/истёкшее окно. Нельзя молча пересоздать job с новым TTL. Local expiry всё равно удаляет pending job.

После reload клиент запрашивает server time/исходный anchor и берёт наиболее раннюю доступную оценку; без сети при CLOCK_UNCERTAIN запрещены upload и private open, очередь остаётся ciphertext до проверки/очистки. Недостоверное время не считается подтверждением «ещё не истекло». Нельзя обещать программное удаление с выключенного устройства или защиту от rollback всего browser profile. Злонамеренный клиент может выдать старую фотографию за новую — сервер не видит E2EE plaintext и не подтверждает authenticity capture time.

Free maximum — 14 × 24h. Платные 3/12+ календарных месяца — конфиг entitlement, не фиктивные 90/365 суток. Calendar addition выполняется в UTC с clamp последнего дня целевого месяца: 31 января + 3 месяца → 30 апреля; 29 февраля + 12 месяцев → 28 февраля. Биллинг задаёт entitlement_end отдельно; никакой renewal не оживляет expired asset. Конкретные лимиты/цены/clock UI утверждаются в соответствующих PR.

## Доступ и storage

Default download — ciphertext через проверяющий API/gateway, ACL/grant/expiry на каждом новом запросе, `no-store`, без CDN/public bucket. Это дороже по трафику API, но упрощает revoke. Read presigned URL — opt-in отдельное решение с явно принятым residual lifetime; пока не базовый путь. Уже начатый stream/скачанные bytes невозможно отозвать задним числом.

Presigned PUT живёт ≤min(reservation/grant/deadline, configurable short max), только на случайный immutable staging object key. Finalize снова проверяет grant, recipient epoch, deadline, ciphertext size/digest и idempotency; HTTP PUT success не означает CLOUD_CONFIRMED. Истёкший staging blob недоступен read API и удаляется как orphan. Original/thumbnail/GPS/versions имеют один parent deadline или меньший; sidecar finalize после parent expiry отвергается.

Expiration transaction сначала блокирует доступ и фиксирует tombstone, затем job удаляет все objects/envelopes, abort multipart, проверяет HEAD/list и retries. Provider lifecycle — дополнительная уборка, не гарантия часового TTL. Retention SLO, versioning/replica policy и physical deletion evidence задаются только после provider tests I08/I15. Object existence check не доказывает стирание физического носителя.

## Restore

Deletion ledger содержит opaque account/Vault/asset IDs, generation, tombstone time/reason и актуальный expiry/policy high-water mark; без DEK/фото/координат. Он хранится и копируется независимо от восстанавливаемого DB snapshot, чтобы доступный более новый ledger нельзя было заменить старой резервной копией той же БД. Это operations contract I08, не новая распределённая платформа I02.

Restore переводит сервис в maintenance/readiness=false, загружает проверенный current ledger и conservative entitlement/policy state, применяет tombstones/expired deadlines, отменяет старые grants/tickets/reservations, выполняет delete/orphan reconciliation и проверяет результат. При недоступном/устаревшем ledger — fail closed, не публиковать архив. Только после sweep и readiness barrier возвращается доступ. Ledger retention должен покрывать максимальный возраст любого разрешённого backup плюс окно восстановления/reconciliation; срок и место копии измеряются в restore drills.

По умолчанию отдельного бессрочного backup оригиналов нет. Если он появится, нужен явный bounded residual retention и purge policy для каждой копии. Encryption backups дополняет E2EE и не разрешает восстановить удалённый контент.

## Проверки до включения TTL

I08: 1h offline/clock rollback/reload, conservative stale anchor, old anchor replacement denial, exact boundary finalize/download/sidecar, calendar clamp/DST, renewal без resurrection, revoke во время запроса, orphan retry, object+child deletion, stale snapshot после ручного delete и plan expiry, ledger missing/readiness denial. Документ — контракт будущих тестов, не реализованная гарантия.
