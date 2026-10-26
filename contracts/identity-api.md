# Identity API v1 — B01/B02 local

Добавлен 15 октября 2026. Laravel, JSON, единый origin gateway. Prefix `/api/v1/identity`. API включён только в `local`/`testing` и при `IDENTITY_ENABLED=true`; production/disabled возвращают 404. Это контракт входа, связей аккаунта и служебной интеграции Matrix. Сообщения идут через Matrix SDK, фото используют B04 E2EE. [ADR](../docs/adr/0006-identity-proof-and-matrix.md), [операции](../docs/operations/identity-matrix-local.md).

## Граница запросов

Все запросы требуют `X-PhotoBunker: identity-v1`. Записи требуют точный разрешённый `Origin`; GET с Origin проверяется так же. CORS выключен: клиент и API используют один origin. Cookies: `pb_identity`, HttpOnly, SameSite=Strict, path `/api/v1/identity`, Secure для HTTPS Origin. Серверная сессия бессрочная до выхода/отзыва устройства (`expiresAt: null`); cookie обновляется в пределах browser limits, пропажа cookie восстанавливается PoP сохранённого device key. На сервере хранится SHA-256 случайного 256-bit session token. Авторизация legacy prototype остаётся независимой.

Клиент после `/me` добавляет `X-PhotoBunker-Account: <ожидаемый свой UUID>` для account-запросов. Если cookie относится к другому аккаунту, 409; при отсутствии сессии 401. Сохранение анкеты дополнительно требует `accountId` и `revision`, чтобы старая вкладка/форма не изменила другой аккаунт после смены cookie. BroadcastChannel передаёт только уведомление о смене сессии, не credentials; сервер остаётся источником прав. Ответы `no-store, private`; service worker не кеширует API или Matrix.

Лимит — 180 запросов/минуту на подтверждённую пару account/device; для гостей — на IP. Challenges и proofs отдельно по 30/минуту/IP. Локальный gateway не пересылает IP; настройку распределённых лимитов нужно пересмотреть перед production. Ошибки используют общий безопасный JSON envelope приложения без SQL, ключей, credentials и внутренних исключений. Значимые статусы: 401 proof/session не подтверждена, 403 Origin/header/legacy-secret, 404 недоступный ресурс или identity, 409 revision/account/ownership conflict, 422 структура данных, 429 лимит/повтор запроса контакта, 503 Matrix недоступен.

## Подтверждение входа

P-256 ECDSA SHA-256 через WebCrypto/OpenSSL. Public key — SPKI DER в base64url без padding. Signature — WebCrypto IEEE P1363, ровно 64 bytes (`r || s`) в base64url; backend преобразует представление в DER перед OpenSSL verify. Account root key и device key различаются.

| Purpose | Поля `POST /challenges` | Чем подписывается |
| --- | --- | --- |
| `register` | `purpose, rootKey, deviceId (UUID), deviceKey, name` | Root private key |
| `recover` | Те же поля, **новый deviceId/key** | Root private key существующего аккаунта |
| `login` | `purpose, publicId, deviceId, name` | Private key зарегистрированного, не отозванного устройства |

`name` ≤80 символов. На UI обрезаются внешние пробелы до создания payload. Challenge ответ: `{id, nonce, message, expiresAt}` (Unix milliseconds), TTL 2 минуты. Подписываемая строка, LF separators, без завершающего LF:

```text
photobunker.identity.v1
<purpose>
<challenge UUID>
<256-bit hex nonce>
<SHA-256 hex of canonical payload>
```

Canonical payload: отсортированные по ASCII имена плоских полей; compact UTF-8 JSON, без escaping Unicode/slashes/line terminators. Клиент сам вычисляет ожидаемую строку, сравнивает с ответом и сроком, затем подписывает. `POST /sessions` принимает `{challengeId, signature}`, атомарно потребляет challenge и регистрирует/обновляет устройство, устанавливает cookie; возвращает `{account, deviceId, expiresAt}`. Сервер не принимает root private key/recovery kit. Повтор использованного или просроченного challenge — 401; неправильная подпись не создаёт аккаунт. Повтор регистрации тем же root не создаёт вторую личность; отозванный deviceId не возобновляется этой операцией.

Recovery kit `PB1.<root SPKI base64url>.<root PKCS8 base64url>` создаётся только клиентом. Он показывается/скачивается **до отправки регистрации** и не сохраняется автоматически в IndexedDB/localStorage. Приватный device CryptoKey non-extractable и хранится в отдельной IDB. Root в памяти формы очищается при завершении/уходе; это best effort в JS, не обещание физического стирания RAM. Это signing credential входа; не универсальный backup ключей.

## Account и анкета

`GET /me`: `{account, deviceId, expiresAt}`. Свой account:

```text
{id: UUID, publicId: "pb_<random>",
 fields: {name, username, email, phone, links, about},
 visibility: {каждое поле: "private" | "contacts" | "public"},
 revision: integer,
 matrix: {state: "pending" | "ready", userId: MXID | null}}
```

Все поля необязательны, пустая строка по умолчанию; видимость private. `PATCH /profile`: `{accountId, revision, fields, visibility}` с полным набором разрешённых ключей. Name/username/email/phone ≤120, links/about ≤1000. CAS увеличивает revision; конфликт не перезаписывает другую работу. Анкета зашифрована Laravel APP_KEY at rest, доступна backend; это **не E2EE**. Public ID нельзя использовать вместо credential. Свой UUID/MXID доступны владельцу, точный lookup другого человека их не возвращает.

`DELETE /session`: закрывает все сессии текущего устройства; cookie истекает, сохраняется право нового явного login своим ключом. Ставит durable Matrix-device revoke и пытается завершить его. После подтверждённого удаления сохраняет новый `matrix_device_id` для следующего входа; до подтверждения прежний ID и pending сохраняются. Клиент удаляет локальные device credentials и wrapping keys. Повторный вход требует единственный ключ аккаунта; фото и SDK secrets восстанавливаются из root-encrypted recovery package (ADR 0014).

## Контакты и видимость

| Endpoint | Результат |
| --- | --- |
| `GET /people/<handle>` | `{publicId, username, fields: только разрешённые, self, blocked, relationship}`; нужен вход, точный публичный ID, @username или локальный Matrix ID |
| `GET /contacts` | `{contacts: Person[], blocked: publicId[]}`; личные сохранённые контакты, без заблокированных |
| `POST /contacts {publicId}` | Сразу добавляет в личный список; повтор идемпотентен |
| `PATCH /contacts/<relation UUID> {accept:boolean}` | Устаревший endpoint: 410 contact_requests_removed |
| `DELETE /contacts/<relation UUID>` | Удаляет только собственную запись |
| `POST /blocks/<publicId>` | Блокирует и удаляет запись из своего списка |
| `DELETE /blocks/<publicId>` | Снимает только собственную блокировку; контакт автоматически не возобновляется |

Person relationship: `null` или `{id, state:accepted, incoming:false}`. Public поля видны авторизованному искателю по точному ID, contacts — если владелец профиля добавил искателя в свой список, private — владельцу. Нет поиска по email/телефону, листинга пользователей или импорта адресной книги. Блокировка собеседником возвращает 404. Собственную блокировку можно увидеть как `blocked:true` для разблокировки; при блокировке доступны только public поля. Удаление контакта не требует ожидания перед повторным добавлением. Контакт не создаёт grants, задания и Matrix membership.

## R1-05 — приватное присутствие

**Источником пользовательского статуса является только PhotoBunker Identity API.** Native Matrix presence не используется: в `infra/matrix/tuwunel.toml` отключены `allow_local_presence`, `allow_incoming_presence`, `allow_outgoing_presence`; в Matrix SDK остаётся `disablePresence: true`. Это предотвращает обход настройки видимости через нативные Matrix presence endpoints/room members. Laravel не хранит сообщения и не запрашивает Matrix/crypto для статуса.

Все endpoints требуют действующую Identity session, `X-PhotoBunker: identity-v1`, origin protection и собственный account binding:

| Endpoint | Контракт |
| --- | --- |
| `GET /presence/privacy` | `{visibility:"all"|"contacts"|"nobody",revision:int}`; default `contacts` |
| `PUT /presence/privacy` | `{visibility,expectedRevision,operationId:UUID}` → `{visibility,revision}`; CAS, повтор того же успешного operation ID с тем же payload идемпотентен, устаревший выбор →409 |
| `POST /presence/pulse` | `{instanceId:UUID,sequence:int,active:boolean}` → `{accepted:true}`; per-tab nonce, сервер сам берёт текущий device ID из сессии и время из clock; явный inactive закрывает lease навсегда |
| `GET /presence/<exact handle or MXID>` | строго `{state:"online"|"recent"|"longAgo"|"hidden"|"unknown"}`; **никогда** timestamps, device IDs, numeric last-seen, raw Matrix data |

Видимость `all` разрешает любой аутентифицированной PhotoBunker сессии; `contacts` требует *двух* встречных записей в `identity_address_book` (не pending/односторонний contact); `nobody` скрывает статус от других. Блокировка в любую сторону, удаление или retirement возвращают `hidden`; никогда не вычислять online на основе avatar, preview, сообщений, старого SDK state или `identity_devices.last_seen_at`.

**Online** подтверждается любым активным, не отозванным устройством со действующей Identity session и хотя бы одним незакрытым browser lease с серверным pulse моложе **85 секунд**. `pagehide`, background и logout передают inactive best-effort; при сетевом сбое server TTL автоматически снимает online. Таймаут не является мгновенным доказательством disconnect. Состояния без live lease: `recent` если последняя **серверно подтверждённая presence-активность** не старше 24 часов; `longAgo` если старше; `unknown` если activity никогда не подтверждалась. Эти интервалы не раскрывают точное время. Нативные timestamp текущих устройств из собственного `GET /devices` не являются публичным presence.

Privacy changes сначала атомарно сохраняются в account+device-scoped encrypted IndexedDB с non-extractable AES-GCM key и устойчивым operation UUID. UI не утверждает подтверждение сервера до `PUT` ACK; offline сохраняет intent локально на доверенном устройстве с открытым PIN gate, а не выдаёт серверные права. Replay на reconnect использует тот же ID; CAS conflict 409 возвращает подтверждённый сервером выбор с видимым уведомлением. Logout/удаление очищают локальные intents; смена аккаунта и запоздалые ответы не переносят состояние другому владельцу.

## Устройства и Matrix

`POST /matrix/conversations/prepare {peers: string[1..30]}` — явное намерение начать переписку. Проверяет все точные handles, запрещает self, удаляемые/истёкшие аккаунты, повторы одного адресата и двусторонние блокировки до обращения к Matrix. Идемпотентно подключает ещё не provisioned Matrix accounts адресатов, без их входа, устройств и E2EE secrets. Затем повторно проверяет актуальную доступность и возвращает `{peers:[Person & {matrixUserId,ready:true}]}`. При недоступной инфраструктуре — 503 `{code:"messaging_unavailable"}`, без деталей/credentials upstream. Саму комнату и сообщения создаёт SDK текущего пользователя. GET lookup не меняет accounts. Контент переписки и ключи в этот API не передаются.

`GET /devices`: `{devices:[{id,name,created_at,last_seen_at,revoked_at,matrix_revoke_pending}]}` только свои. `DELETE /devices/<UUID>`: `{revoked:true,matrixPending:boolean}`. PhotoBunker сессии удаляются немедленно; подпись отозванного устройства не даёт вход. Matrix отзыв может ожидать сервера и повторяется scheduler; до подтверждения прежний token может ещё работать в Matrix.

`POST /matrix/provision`: идемпотентно создаёт/подтверждает один обычный Matrix account, `{state:"ready"}` либо 503. Сбой не откатывает PhotoBunker account. `POST /matrix/session`: только своё подтверждённое устройство, `{userId,deviceId,accessToken,baseUrl:"/"}`. User ID связан с UUID, первый device ID `PB_<device UUID без дефисов>`, после выхода — сохранённый ID с случайным суффиксом новой crypto identity; клиент проверяет whoami. Password/shared secret/admin token не выдаются. Matrix token в UI остаётся только в памяти активного SDK, не URL/IDB/cache. API проверяет отзыв и существование исходной PhotoBunker сессии после внешней операции.

`GET /infrastructure`: `{matrix:{ready:boolean,serverName},photos:{encrypted:false,mode:"local-prototype"}}`. Matrix readiness отдельно от `/api/v1/ready`; камера не ждёт его. SDK/crypto запускаются лениво в «Сообщениях»; один владелец crypto store между вкладками. [B02 и восстановление](../docs/operations/matrix-messaging.md).

## Служебные endpoints переписки

`GET /matrix/peers`: `{peers:[{publicId,matrixUserId,fields,relationship,self,ready}],blocked:MXID[]}`. Только принятые контакты, разрешённые viewer поля, без двусторонне заблокированных. `blocked` объединяет обе стороны политики для закрытия sends в клиенте. Это metadata integration; комнаты и сообщения не хранятся Laravel.

`POST /matrix/signing {keys:{master_key,self_signing_key,user_signing_key}}`: публикация только своих публичных Matrix cross-signing keys. Проверяет точную структуру, свой MXID, usage, единственный ed25519 public key 32 bytes и допустимые signatures 64 bytes; private/foreign/лишние поля → 422 до Matrix. UIA с generated password выполняется внутри backend; пароль/auth dictionary в ответе отсутствуют. Сравнение известного master key выполняется под account lock: замена → 409, автоматического reset нет. Успех `{}`, внешний сбой 503. Клиент хранит private signing/recovery secrets через SDK, не через этот endpoint.

## Legacy proof и миграция

`POST /legacy-proof {libraryCode}` — действующий 64-char secret прежней prototype library. Ответ `{proofRecorded:true,photosMigrated:false}`. Одна библиотека может быть подтверждена только одним account; повтор владельца идемпотентен, другой account получает 409. Хранится library UUID ↔ account UUID, исходный secret не копируется. Никаких фотографий, существующих ссылок, владельцев, ACL или encryption epochs операция не меняет. Отдельное действие «Перенести прежние данные» B03 копирует данные в account Vault: [контракт](account-workspace-api.md). Перенос plaintext в E2EE относится к B04.


## Уточнение после B04

Обязательная авторизация всех app routes, постоянный device login и опциональный PIN всего приложения: [ADR 0010](../docs/adr/0010-persistent-device-login-and-application-pin.md). `account.username` — уникальный публичный lower-case slug; сохраняется через прежний profile PATCH, optional leading @ нормализуется. Конфликт имени: 422 `{code:"username_taken"}`; private profile fields сохраняют свою visibility. `GET /people/@username` и `/matrix/resolve/@username` — exact lookup с текущими блокировками. Resolve возвращает Matrix user ID/readiness для личного приглашения, не требует предварительного контакта.

`POST /matrix/conversations/deletion` принимает `{roomId}`, проверяет actual two-member direct room/current joined requester/registered creator и разрешает обоим участникам redaction в этой DM. Group/assignment state не принимает. API не принимает plaintext chat, не выдаёт чужие tokens и не redacts произвольные supplied event IDs от имени третьего лица. Реальные redactions и encrypted clear control отправляет SDK участника. Archive/own-clear/hidden event IDs синхронизируются стандартным room account data Matrix. [Сценарии](../docs/operations/messenger-actions.md).


Authenticated Identity read/write budgets are separate per device: 1200 GET and 180 mutations/minute, configurable. Nonce/proof abuse limits remain separate. Read traffic cannot consume the authentication/write budget; 429 does not clear Identity or imply a wrong recovery key. A regression sends 181 consecutive reads, then verifies write throttling independently.


## Единый encrypted recovery package

Жизненный цикл аккаунта уточнён в [ADR 0015](../docs/adr/0015-account-inactivity-and-storage.md). Identity credentials не истекают по времени сами по себе; независимая политика неактивности удаляет аккаунт после выбранных 30–360 дней (default 180).

`account.rootKey` в собственном `/me`/auth payload — публичный SPKI P-256. `GET /api/v1/identity/recovery` возвращает `{envelope:null|{statement,signature}}`. `PUT` принимает canonical JSON строку envelope, до 200000 символов. Statement: version=1, accountId, revision 1..1000000, rootKey, iv (12 bytes base64url), ciphertext (17..131072 decoded bytes). Подпись P-256 `Protocol::message('account-recovery',statement)` проверяется root текущего account. Только авторизованное устройство текущего account, origin/account binding. Первая revision=1; далее ровно +1; точный повтор идемпотентен. Конфликт →409, чужой root/account или незаявленные поля →422. Backend хранит только ciphertext envelope, без пользовательского ключа, SDK/photo secrets и message text. [ADR 0014](../docs/adr/0014-single-account-key.md).


## Данные, хранение и неактивность

Все endpoints требуют Identity origin/cookie/account binding, без photo-read grant и без private key в запросе.

- `GET /storage` → `{inactivityDays,lastActiveAt,deletesAt,ownedPhotos,encryptedBytes}`. Время в epoch milliseconds; ciphertext bytes включают pending/unverified deletion, а фото считаются только active/unexpired в scope creator/owned vault. GET не продлевает срок.
- `PATCH /storage {inactivityDays}` → `{inactivityDays,lastActiveAt,deletesAt}`. Целое 30–360, иначе 422. Сохранение продлевает срок от серверного now.
- `POST /activity` → те же policy fields. Для foreground use; клиент вызывает на открытие/возвращение/доверенный user input, не от фоновых timers. Срок общий для устройств аккаунта.
- `DELETE /account {accountId,confirmation:"DELETE"}` → 202 `{state:"deletion_queued"}`. Неверная привязка →409, отсутствие явного confirmation →422. Немедленный отзыв app access/read grants/shares, encrypted recovery envelope удаляется. Worker физически очищает фото/версии/ссылки/backup и затем удаляет аккаунт. После 202 cookie удаляется; следующие запросы старой session →401.

При истёкшем inactivity deadline ещё существующая session →410 `{code:"account_expired"}`. Новый proof login/recover этого аккаунта также →410; activity не воскрешает его. После физического удаления восстановление прежнего аккаунта невозможно. Другие пользователи не находят удаляемый аккаунт через people/resolve, contacts/peers продолжают работать. Копии shared messages у собеседников не входят в promise физического удаления с чужих устройств. Подробнее [runbook](../docs/operations/account-storage.md).


## Имена участников переписки

`GET /matrix/resolve/{handle}` дополнительно принимает URL-encoded локальный Matrix ID строго вида `@pb_<account UUID без дефисов>:<configured server>`. Ответ соответствует прежнему exact publicId/@username lookup: `publicId`, public username, только доступные actor поля профиля, Matrix user ID/readiness. Чужой homeserver не преобразуется в local account; self, blocked, unavailable/deleting accounts не разрешаются. Private fields не публикуются в Matrix room state. Клиент кеширует доступный профиль только в памяти текущего подключения; разрешение имени не создаёт relationship контакта.

## Direct messenger and personal contacts (2026-10-17)

`POST /contacts { publicId }` immediately saves a personal address-book entry, idempotently. No request or acceptance is required. `GET /contacts` synchronizes this owner's entries across devices; `DELETE /contacts/{id}` removes only an entry owned by the actor. The retired acceptance endpoint returns 410. Previously accepted mutual contacts migrate to two personal entries; pending requests do not migrate. Contact-only profile fields are visible if the **profile owner** saved the viewer, subject to bilateral blocks. Saving another person never grants access to their restricted fields.

`POST /matrix/conversations/activate { roomId }` enables immediate delivery after SDK private encrypted direct/group creation. The backend reads actual Matrix state, requires the actor to be joined, validates app room kind, Megolm encryption, local living accounts, participant limit and bilateral blocks. It joins only actual invitations sent by the actor, using each recipient's metadata-only workspace device. A direct room must have exactly two historical member identities. Existing direct rooms with joined-only history are normalized to invited history for future events by their actual creator. Responses: `{ ready: true }`, 403 for unsafe state, 503 `{ code: "messaging_unavailable" }` for upstream failure. No message plaintext, device crypto keys or attachment keys pass through this endpoint. The sender waits for SDK membership synchronization before sending; incoming legacy encrypted invitations from a recognized, unblocked local sender are joined automatically on a verified device.


## R1-08A — emergency signing key и credential-independent intent (D5A)

Эта часть предоставляет **только** регистрацию/ротацию/отзыв emergency signing key в разблокированном Security UI и криптографическую/серверную основу. Lock-screen trigger, emergency-очистка устройства, durable offline intent/outbox и reconnect принадлежат R1-08B (#30) и **здесь не работают**.

**Authenticated key management** (обычный `IdentityBoundary`, действующая cookie, `X-PhotoBunker: identity-v1`, разрешённый `Origin`, account/device из Identity, не из тела):

- `GET /api/v1/identity/emergency/key` → `{keyId:null|UUID,revision:number,active:boolean,createdAt:null|string}`.
- `PUT /api/v1/identity/emergency/key`: `{operationId:UUID,keyId:UUID,publicKey:base64url(SPKI P-256 DER),expectedRevision:number}`. Сервер атомарно отзывает прежний key того же account/device, повышает revision и сохраняет operationId. Возвращает `{keyId,revision,active}`; повтор с идентичной операцией идемпотентен, отличающийся payload или устаревшая revision — 409. Ответ с `active:false` не подтверждает успешную регистрацию.
- `DELETE /api/v1/identity/emergency/key`: `{operationId:UUID,keyId:UUID,revision:number}`. Отзывает только текущий ключ той же account/device/revision. Повтор той же операции идемпотентен. История отозванных ключей сохраняется до фактического удаления аккаунта.

Клиент сначала durable сохраняет **только encrypted private PKCS8** в account/device-scoped IndexedDB `photobunker-emergency-v1`: `version:1,salt(16 bytes),iterations(100000–600000),iv(12 bytes),ciphertext,publicKey,keyId`. AES-GCM с AAD `photobunker.emergency.v1:<keyId>:<publicKey>`; WebCrypto PBKDF2-HMAC-SHA-256 от отдельного 6/8 PIN. Plain PIN/PB1/PKCS8 не сохраняются. `pending.operationId` переживает reload для idempotent registration/disable retry. UI показывает подтверждение только после ответа или свежей сверки active keyId/revision с сервером. Никаких обещаний стойкости короткого PIN к offline-перебору скопированного профиля браузера.

**Credential-independent destructive endpoint** (отдельный `EmergencyIntentBoundary`; ни cookie, ни device credential не используются для авторизации действия):

`POST /api/v1/identity/emergency/intent` с JSON-объектом **ровно** `{intent:string,signature:string}` и заголовками `X-PhotoBunker: identity-v1`, разрешённым `Origin`, `Content-Type: application/json`. `intent` — каноническая JSON-строка (ASCII ordered keys, без whitespace), содержащая **ровно** `{version:1,operationId:UUID,accountId:UUID,keyId:UUID,revision:int,action:"emergency-delete"}`. Подпись — P-256 SHA-256 WebCrypto P1363 base64url, охватывает `photobunker/emergency-delete/v1\0` + canonical UTF-8 bytes intent. Старые/отозванные/чужие ключи не могут инициировать новый claim.

Первый валидный intent атомарно внутри **существующего `AccountLifecycle::claim(..., reason:"emergency")`** создаёт immutable `identity_emergency_receipts` и отзывает активный account/device/session/read/share/grant доступ. Object/Matrix cleanup осуществляет **существующий** `photobunker:account-maintain` с retry/backoff. Receipt остаётся без account foreign key после физического удаления. Один operationId связан с неизменным payload+signature; повтор того же intent может получить `accepted` (первый подтверждённый приём), `processing` (отложенная очистка) или `completed` (физический AccountLifecycle закончен). Подмена payload/key/revision для использованного operationId →409. Никаких автоматических destructive действий при простом вводе PIN в Settings.

**Граница гарантий:** `accepted/processing` не доказывают физическое уничтожение серверных объектов/Matrix и не обещают удаление копий получателей, браузерных snapshot и блоков ОС. Доступность всего API наследует текущий `identity.enabled` и `local/testing` deployment gate, не переводя API самостоятельно в production. Тесты destructive-сценариев используют только синтетическую in-memory SQLite, Storage::fake и фальшивые Matrix/HTTP ответы.
