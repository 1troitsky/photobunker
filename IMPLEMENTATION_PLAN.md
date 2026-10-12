# PhotoBunker — план реализации через отдельные PR

Дата: 12 октября 2026 года. Статус: I01 реализован и проверен локально; I02–I15 ожидают реализации.

Основание: исходная [переписка](https://chatgpt.com/share/6acc82b8-f334-83eb-b082-955f687480dc), [_docs/README.md](_docs/README.md) и все спецификации 01–13. План намеренно находится вне `_docs`: требования остаются нормативными, а декомпозицию можно уточнять по результатам инженерных проверок.

## 1. Что строим

Небольшую независимую PWA с двумя равноправными сценариями: личная приватная камера/архив и совместная съёмка по профилю куратора. Быстрый цикл: открыть → снять без ожидания GPS/сервера → зашифровать и надёжно поставить в локальную очередь → подтвердить облачную доставку → позднее открыть галерею, редактировать и делиться. Оригинал неизменяемый; версии и метаданные отдельные и зашифрованные.

Основные ограничения архитектуры:

- Оператор не получает ключи расшифровки фотографий, thumbnails, EXIF/GPS, описаний, профилей и редакторских документов. Риск злонамеренного JavaScript с origin остаётся явно описанным.
- Камера доступна до PIN; этот режим умеет создавать ciphertext, но не получает права/ключи чтения архива. PIN — локальный барьер интерфейса, strong unlock — отдельная операция.
- Приложение не записывает снимки в системную галерею. Временная локальная очередь содержит ciphertext; export — отдельное явное действие.
- `CAPTURED_IN_MEMORY`, `LOCAL_COMMITTED` и `CLOUD_CONFIRMED` различаются. Потеря сети/GPS не отменяет съёмку; отсутствие места может помешать фиксации и должно дать явную ошибку.
- Upload, GPS и curator review — независимые состояния. После закрытия PWA фоновые действия не гарантируются.
- TTL ограничивает оригинал и все связанные объекты. Free ≤14 суток; дешёвый платный — 3 календарных месяца; старшие — ≥12 месяцев. Пользователь может сократить срок до часа. Доступ прекращается по deadline; физическое удаление проверяется отдельно.
- Анонимный аккаунт без обязательных email/телефона; recovery у пользователя. Оплата — предоплата ёмкости/срока криптовалютой, без автоматической подписки.

## 2. Состояние репозитория и локального окружения

- Репозиторий: `https://github.com/1troitsky/photobunker.git`.
- Рабочая папка: `/Users/ivan/Documents/www/photobunker`.
- `origin` настроен на указанный репозиторий; реализация I01 находится в ветке `codex/local-foundation`, созданной от `docs/product-foundation`.
- Исходный commit документации: `dc549a497e7ebcb7e4d460b8318b55ac9ce640c5`.
- [PR №1 с документацией](https://github.com/1troitsky/photobunker/pull/1) открыт, ещё не merged. База реализационного PR — `docs/product-foundation`; нормативные `_docs` не изменены.
- OrbStack запущен, Docker context — `orbstack`. PHP 8.4, Composer, PostgreSQL 17, Garage 2.4.1 и Node.js 22 работают в Compose; host PHP/Composer/psql не требуются.
- Добавлены Vue/TypeScript shell, Laravel JSON API, infrastructure migrations, worker/scheduler, Nginx, lockfiles, CI, env bootstrap и runbook. Приложение доступно на `http://localhost:8080`.
- Проверены 13 API tests (84 assertions), Pint, 8 frontend tests, typecheck/build, health/readiness и реальные S3 PUT/HEAD/GET/DELETE, presigned PUT/GET, запрет анонимного чтения и cleanup. Smoke проходит с изолированной сетью приложения и после возврата обычной сети.
- Синтетическая запись PostgreSQL и точные bytes S3 пережили `down` → `up` с пересозданием контейнеров. Проверочные данные удалены, рабочий контур оставлен запущенным.
- В Chrome проверены desktop/mobile viewport, навигация, RU/EN, отсутствие внешних запросов и запроса камеры. Production service worker проверен с отключённой сетью: shell открывается после reload, API не возвращает кэшированный ответ. Реальные iOS/Android PWA, browser S3 и multipart остаются pending.
- HTTPS labels OrbStack настроены. Доступ Mac к контейнерным IP/domains пока не проходит, несмотря на включённые network bridge/HTTPS; проверенный рабочий адрес — localhost. Доверенный HTTPS на телефонах относится к отдельной device-настройке.

Перед первым реализационным PR следует включить спецификацию из PR №1 в базовую ветку. Если реализация начнётся до его merge, использовать явно обозначенный зависимый PR с базой `docs/product-foundation`, затем сменить базу после merge. Не создавать случайно PR, включающий всю документацию повторно.

## 3. Предлагаемые технические решения

Это рабочие предложения, а не новые требования владельца. Финальные ADR должны описать проблему, варианты, компромиссы, основной вариант, fallback и проверки до реализации соответствующего механизма.

| Область | Предлагаемый вариант | Компромисс, fallback и проверка |
|---|---|---|
| Клиент | Vue 3 + TypeScript + Vite; npm и lockfile | Соответствует спецификации. Отдельный `vue-tsc` в CI; сборка сама по себе не заменяет проверку типов. |
| API | Laravel 13, PHP 8.4, PostgreSQL; один scheduler/worker | Локальный стек принят в ADR 0001. PHP/Composer/БД доступны в контейнерах через OrbStack/Compose; установка на host опциональна. Зависимости закреплены lockfile, образы — digest. |
| Организация | `apps/web`, `apps/api`, `contracts`, `docs/adr`, `docs/operations` | Один репозиторий, один API. Рекомендуемый локальный контур — Compose через OrbStack; это не требование Docker для production или единственный способ разработки. Redis необязателен; на старте database queue. Общий контракт — схемы/envelope definitions, без попытки делить исполняемый код между PHP и TS. |
| Криптография | Предпочтительно поддерживаемая browser-сборка libsodium: стандартный file encryption API и public-key envelopes | Сначала ADR формата, совместимость и review. Кандидат: secretstream для медиа, независимые DEK для объектов, sealed envelopes и отдельно аутентифицированный отправитель/manifest. Sealed box сам по себе не удостоверяет отправителя. WebCrypto — альтернативный reviewed вариант, если размер/память/совместимость libsodium неприемлемы; собственного nonce/chunk протокола без review не вводить. |
| Unlock | Высокоэнтропийный Recovery Key как переносимый базовый способ; PIN для интерфейса в тёплой сессии | Private E2EE key не сохраняется под одним коротким PIN. После reload/полного cryptographic lock нужен strong unlock. Сильная passphrase и аппаратно защищённое удобное unlock — отдельные варианты после проверки KDF/platform capabilities. |
| Capture context | Проверенный публичный recipient key + epoch + нейтральный alias + ограниченный uploader credential | Долговременный capture context не содержит Vault read key. Ключи аутентификации и шифрования разделены по назначению; uploader credential не открывает read API. Проверить подмену recipient key, replay и отзыв. |
| Локальная очередь | IndexedDB: encrypted payload + encrypted job manifest, атомарный commit | Начать с измерения Blob/transaction на реальных устройствах. Если нужен OPFS, использовать write→verify→commit и cleanup незавершённых файлов. Fallback при невозможности durable commit — явная ошибка, без ложного «сохранено». |
| Фото | `getUserMedia`; `ImageCapture.takePhoto()` по feature detection; Canvas fallback | Фактическое разрешение и ориентация измеряются на iOS/Android. Отображать ограничение качества fallback; не требовать file-input capture и не уменьшать все оригиналы до FullHD. |
| Storage | Заменяемый S3 adapter; локально standalone контейнер Garage — кандидат, production R2 — отдельный кандидат | Локальная разработка не требует AWS/R2 аккаунта, облачных credentials или внешнего storage. Проверить PUT/HEAD/DELETE, multipart, checksum, CORS и cleanup на локальном endpoint; отдельные provider contract tests выполнить перед production. Случайные object keys, private bucket, никаких server-side image pipelines. |
| Чтение/отзыв | По умолчанию выдача ciphertext через проверяющий API/gateway с ACL и TTL на каждом новом запросе | Упрощает строгий revoke/delete ценой API-трафика. Прямой presigned GET — только если принят и описан остаточный срок его действия; срок ≤ min(asset, share, grant). Уже полученные bytes отозвать невозможно. |
| UX defaults | Camera home; PIN на приватные разделы; UI lock сразу при background; GPS только с согласия | UI lock скрывает и освобождает decoded previews. Полный cryptographic lock удаляет доступные private-key references и требует strong unlock; PIN не возвращает уничтоженный секрет. GPS active window — стартовый кандидат 15 секунд, не обещание точности. |
| Retention defaults | Free max 14 суток; пользовательский TTL от часа; worker scan — кандидат раз в минуту | Offline clock, calendar-month semantics, backup остаточный срок и physical-delete SLO фиксируются отдельно. Числовой SLO удаления объявлять после провайдерных тестов. |
| Оплата | Отдельный invoice/entitlement ledger; XMR receiving integration — кандидат | До включения реальных платежей выбрать сеть, формулу перекрывающихся покупок, confirmations/refunds и юрисдикцию. Конкретные GB/цены остаются открытыми. |

Первичные источники для предложений: [Vue + TypeScript/Vite](https://vuejs.org/guide/typescript/overview.html), [Laravel support/PHP requirements](https://laravel.com/framework/docs/13.x/releases), [libsodium secretstream](https://doc.libsodium.org/secret-key_cryptography/secretstream), [sealed boxes и ограничения sender authentication](https://doc.libsodium.org/public-key_cryptography/sealed_boxes), [ImageCapture](https://developer.mozilla.org/en-US/docs/Web/API/ImageCapture). Версии зависимостей перепроверяются при создании соответствующего PR.

### Локальная разработка без внешних сервисов

Уточнение владельца: локальная сборка и повседневные проверки должны обходиться без внешних сервисов. После первоначального скачивания образов и зависимостей client/API, storage, очереди и основные тесты должны работать без доступа в интернет. Это критерий I01 и всех последующих интеграций, а не утверждение, что окружение уже настроено.

- OrbStack запускает Docker/Compose-контейнеры. Локально нужны PostgreSQL, S3-совместимый storage и Laravel API/worker/scheduler; Vue/Vite можно запускать имеющимся Node на host или в контейнере. Redis добавляется только при необходимости.
- Кандидат для локального S3 — Garage в single-node режиме с persistent volumes, локальным bucket и локальными ключами. Проверить совместимость используемого PHP SDK/adapter, presigned PUT, multipart, CORS и delete/read denial. Окончательный образ/version закрепить при bootstrap после проверки. AWS/R2 аккаунт и удалённая активация storage не нужны.
- Файлы и БД переживают обычный restart; destructive reset — отдельная явная команда. Локальные env/ключи не переиспользуются в production.
- Endpoint для API внутри container network и адрес подписанной загрузки, доступный браузеру, задаются согласованно. Для тестов на телефоне предусмотрен локальный HTTPS и доступ по LAN без обязательного публичного tunnel; сертификат доверяется на тестовом устройстве.
- Шрифты, JS и crypto assets входят в сборку. Никаких обязательных CDN, аналитики, внешнего auth/email сервиса или reverse-geocoding. GPS берётся через разрешённый browser/OS API; его доступность/точность не гарантируется офлайн. Детерминированные geo tests используют синтетические samples.
- Платежи проверяются локальным simulator/fake adapter; реальные blockchain/node/provider интеграции и browser push — отдельные opt-in проверки, не зависимость запуска приложения и основной test suite.
- Acceptance: после подготовки dependencies отключить внешний интернет, запустить локальный контур и выполнить доступные на текущем этапе сценарии; после I08 — capture → encrypted queue → local S3 upload → gallery → TTL/delete. Отдельно отключить доступ браузера к локальному API для проверки настоящего offline outbox.
- Локальный S3 не считается точной копией production provider: ограничения ACL/IAM, checksum, versioning/lifecycle и durability проверяются отдельно до публичного релиза.

Источники: [OrbStack Docker/Compose](https://docs.orbstack.dev/docker/), [Garage single-node/Docker](https://garagehq.deuxfleurs.fr/documentation/quick-start/), [Garage S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/).

## 4. Решения, которые нельзя отложить до конца реализации

1. **Camera-before-PIN и восстановление.** Разделить signing/auth keys, Vault decrypt keys, capture public keys и recovery bundle. Согласовать UX тёплой PIN-сессии, reload и полной криптоблокировки. Проверить отдельным upload-only principal, что серверный ACL и криптография независимо запрещают чтение.
2. **Проверка recipient keys.** Сохранённый capture context должен происходить из аутентичного unlock/invite; сервер не может незаметно подменять ключ получателя. ADR описывает подписи, key binding, TOFU/out-of-band verification и остающиеся границы доверия web origin.
3. **Поздние данные без read key.** Thumbnail создавать и шифровать при capture, пока plaintext в памяти. GPS sidecar получает собственный DEK/envelope: исходный DEK ему не нужен. Upload-only клиент может blind append к собственному снимку; слияние старых ревизий выполняет читающий клиент. Никакого overwrite неизвестных метаданных.
4. **Очередь и смена epoch.** После уничтожения ephemeral DEK старую обёртку нельзя автоматически пересоздать без decrypt capability. Предлагается sealed recovery envelope только для DEK собственных pending captures на ключ устройства-создателя; private recovery key доступен лишь после strong unlock. Envelope остаётся в локальной зашифрованной очереди, удаляется после cloud ack/TTL и для strict drop-only не включается в облачный read manifest. При конфликте — `ACTION_REQUIRED`, strong unlock и rewrap без неявного grant чтения своего или чужого архива. Если для гостевого submitter recovery envelope недоступен, явно выбрать ограниченную old-epoch policy или отказ с сохранением очереди до TTL. Удаление/отзыв участника всегда отменяет его uploader grant.
5. **TTL и время.** Определить семантику от capture, server time anchors, clock jumps/reload, offline expiry и календарные месяцы. Недоверенное время не должно продлевать максимальный срок или оживлять expired asset. UI показывает оценку и отдельно authoritative server deadline; при неопределённости требуется проверка, а не фиктивная точность.
6. **Restore без воскрешения.** История актуальных tombstones/удалений должна переживать восстановление старого snapshot. До readiness выполняется expiry/delete sweep; остаточный срок deletion ledger покрывает окно всех допустимых backups. Проверить ручное удаление после backup и восстановление до него.
7. **Encrypted profile enforcement.** Сервер проверяет scopes, видимые сроки и роли, клиент — зашифрованные требования. Capture-only участник получает только необходимые ему правила/ключи профиля. GPS/время/достоверность нельзя объявлять сервером проверенными фактами.

## 5. Порядок реализации

`I01`–`I15` — обозначения этапов плана, не реальные номера GitHub PR. Каждый этап — отдельный reviewable PR; слишком большой этап делится с сохранением зависимостей и критериев готовности. Новые публичные сценарии включаются только после реализации их confidentiality и lifecycle checks.

### I01 — каркас проекта и воспроизводимая разработка

Статус: реализован локально. Команды и границы проверок: [README](README.md), [runbook](docs/operations/local-development.md), [ADR 0001](docs/adr/0001-local-foundation.md). CI-конфигурация добавлена; результат GitHub Actions проверяется отдельно от локального запуска.

- Создать Vue/TS/Vite client, тонкий Laravel API, конфигурацию PostgreSQL, примеры env без секретов, команды запуска и CI с lockfiles. Подготовить локальный Compose-контур для OrbStack с PostgreSQL/S3, persistent volumes, bucket bootstrap и health checks; PHP/Composer можно запускать в контейнере.
- Добавить базовый PWA shell, маршрутизацию, локализуемые RU/EN тексты и основу security headers/CSP. Выбрать очередь/планировщик без дополнительных обязательных сервисов.
- Результат: новый разработчик может запустить client/API/local storage и выполнить сборку/typecheck без облачного аккаунта; после скачивания dependencies повседневный локальный контур работает без внешнего интернета. Нативный запуск остаётся альтернативой, production не обязан использовать Docker.
- Основание: 03, 11, 13; acceptance 12.K. Пока нет пользовательской съёмки/хранения.

### I02 — архитектурные решения и ранняя матрица браузеров

- Зафиксировать ADR: crypto format/AAD/manifest/key hierarchy, auth vs decrypt, strong unlock/PIN, capture-only, epoch conflicts, storage/TTL/access и restore.
- До crypto implementation завершить review выбора протокола. Отдельный compatibility spike с синтетическими данными: still-photo resolution/orientation, IndexedDB atomic Blob commit, lifecycle, память и CSP/WASM.
- Результат: выбранные схемы и fallback имеют проверяемые основания. Реальные iPhone Home Screen PWA и Android PWA входят в раннюю матрицу; непроверенные результаты остаются явно pending.
- Основание: 04, 06, 07, 11–13; acceptance 12.C/D/F/I/K.

### I03 — криптографическое ядро и recovery format

- Реализовать reviewed format, DEK/envelopes, authenticated object bindings, versioned encrypted manifests, recovery wrapping и отдельные назначения ключей.
- Проверить known-answer vectors, round trip между браузерами, wrong recipient, подмену asset/kind/epoch, truncation/reorder/duplicate chunks и malformed inputs.
- Результат: backend с копией DB/storage не имеет decrypt capability; минимальный upload-only principal шифрует, но не расшифровывает архив.
- Основание: 02, 06; acceptance 12.F и crypto test matrix. Это механизм, ещё не законченный пользовательский продукт.

### I04 — анонимный аккаунт, личный Vault и режимы авторизации

- Добавить proof-of-possession с anti-replay challenges, scoped sessions, регистрацию без email, recovery confirmation, восстановление на новом устройстве, device list/link/revoke и личный Vault.
- Выдавать проверенный capture bundle отдельно от read capability; реализовать PIN UI gate и strong unlock, lock/visibility/idle handling без decoded thumbnail leaks.
- Результат: можно восстановить личный Vault, отозвать устройство и доказать отказ read API для capture-only сессии; украденные browser files не содержат private key, защищённый только PIN.
- Основание: 01–03, 06, 11; acceptance 12.A/B/F.

### I05 — камера, encrypted outbox и Quick Exit

- Capture pipeline: timestamp/sequence → encryption → atomic local commit; encrypted thumbnail в памяти, нейтральный locked UI, no app sound/vibration, no system-gallery writes.
- Очередь восстанавливается после reload, имеет bounded memory/concurrency и понятный backpressure. UI различает сохранение в памяти, durable local commit, ошибки storage и ожидание облака.
- Quick Exit скрывает private UI, останавливает camera tracks и показывает нейтральный count/status очереди; не обещает продолжение работы в фоне.
- Проверки: offline shutter, kill до/после commit, full storage, 20 кадров, lock во время encryption, denied camera, Canvas fallback.
- Основание: 03, 04, 06, 12; acceptance 12.B/C/D/K. До следующего этапа облачный success недоступен.

### I06 — S3 uploads, квоты и подтверждение облака

- Реализовать storage adapter, init/reservation, прямой scoped PUT/multipart, resume/retry, idempotent complete и атомарную видимость asset.
- Complete проверяет ACL, epoch, TTL, размер и достоверный ciphertext checksum. Multipart ETag не считать универсальным криптографическим hash; provider fallback определён явно.
- Включить server expiry denial с первой загрузки, expired reservation/orphan cleanup и запрет позднего finalize. Все accounting operations устойчивы к гонкам и повторным запросам.
- Результат: `CLOUD_CONFIRMED` появляется только после storage verification и DB commit; local cleanup выполняется после ack, pending sidecar jobs не теряются.
- Основание: 02, 04, 07, 11; acceptance 12.D/F/I/J. До I07 — только внутренний стенд с синтетическими объектами.

### I07 — полный lifecycle удаления и восстановление

- Реализовать TTL policy, access revoke/tombstones, restartable delete worker, HEAD/list verification, retries/alerts и каскад original/thumbnail/sidecar/version/share.
- Проверить provider versions, abandoned multipart и caches; delete Vault/account с restartable cursor. Добавить reconciliation DB↔storage↔quota.
- Restore запускается с актуальной историей tombstones и sweep до readiness. Проверить истечение часа, offline expiry, finalize/delete race и удаление после snapshot.
- Результат: нет доступа после authoritative deadline и нет воскрешения; physical cleanup имеет измеренный результат и честно описанные backup residues.
- Основание: 02, 06, 07, 12; acceptance 12.I.

### I08 — приватная галерея и первый законченный сценарий

- Добавить paginated/virtualized gallery, client decryption thumbnails/originals, просмотр и локальный поиск разрешённых метаданных, TTL indicators, export/delete controls.
- Ограничить decode/memory, освобождать object URLs и previews при lock; service worker хранит app shell без plaintext медиа. Настройки стартового экрана/PIN доступны в защищённом разделе.
- Результат: onboarding/recovery → личный Vault → capture до PIN → encrypted queue → verified upload → unlock/view → expire/delete работает целиком.
- Основание: 01–04, 06, 07, 11, 12; acceptance 12.A–D/F/I/K. Это первая внутренняя вертикаль; остальные обязательные функции ещё впереди.

### I09 — GPS и независимые metadata revisions

- Согласие, watch только в активной capture session, samples с measured/observed/captured time, алгоритм выбора с accuracy/age/movement и прозрачными quality states.
- Независимые encrypted sidecars и их очередь/finalize/conflicts; текст, категории и теги. Upload-only blind append не требует original DEK или read access.
- Проверить GPS через 6 секунд, более точный sample после перемещения, denied/approximate location, clock jump, уже загруженное фото с pending GPS и выход из приложения.
- Основание: 04–06, 11, 12; acceptance 12.E/F. Reverse-geocoding по умолчанию выключен.

### I10 — неразрушающий редактор и версии

- Собственная versioned edit schema и renderer adapter; текст, рисунки, фигуры, crop/rotate/flip, brightness/contrast/saturation и остальные обязательные корректировки из 08.
- Undo/redo, encrypted draft, локальные preview/render, encrypted version save и optimistic concurrency с branches при конфликте; original immutable.
- Проверить Cyrillic fonts, touch/keyboard, orientation, large images, reload draft, offline save, concurrent edits и expiry во время работы.
- Основание: 06–08, 11, 12; acceptance 12.G. Editing workflow начинается из подтверждённого облачного asset.

### I11 — безопасный export/redaction и приватные ссылки

- Добавить visual blur/pixelate и отдельный необратимо flattened redacted export. Получателю redacted share не выдавать original, original key, edit JSON или обратимые masks.
- Scoped links на выбранные версии, fragment secret, expiry/revoke, при необходимости сильная passphrase; очищенные referrer/logs, отсутствие доступа к остальным данным аккаунта.
- Проверить, что клиент получателя технически не может получить скрытый оригинал; expiry/revoke применяются ко всем связанным download requests.
- Основание: 02, 06–09, 11, 12; acceptance 12.F/G/I и sharing test matrix.

### I12 — совместный Vault, роли и key epochs

- Добавить owner/curator/contributor/viewer, invitations, recipient verification/envelopes, membership revoke/rotation и отдельную криптографию upload-only.
- Проверить независимую расшифровку owner/curator, отсутствие archive keys у contributor, разрешённое own-photo чтение отдельным grant и отказ эскалации прав.
- Применить ADR очереди при epoch change; отзыв запрещает новые запросы и будущие ключи. UI объясняет пределы отзыва уже полученных данных.
- Основание: 02, 06, 07, 09, 11, 12; acceptance 12.H/I.

### I13 — профили, задания и кураторский workflow

- Versioned encrypted Profile, Assignment и capture session с разрешённым контекстом; профиль опционален для личного Vault и не превращается в папку.
- Snapshot правил на asset, incomplete metadata без блокировки shutter, shot list и review states с encrypted comments/retake requests.
- Live updates через polling/opaque SSE IDs; notification bodies encrypted, push только generic и opt-in. Клиент валидирует encrypted rules, сервер — ACL/scopes.
- Основание: 01, 02, 04, 05, 09, 11, 12; acceptance 12.H и collaboration/notification cases.

### I14 — prepaid entitlements и криптоплатежи

- Зафиксировать capacity/duration/top-up algebra, calendar semantics, downgrade/expiry и явное продление неистёкших assets без resurrection.
- Добавить immutable invoice/credit ledger, receiving adapter, confirmation/reorg/underpay/overpay/late-payment states и idempotent activation.
- Сначала synthetic invoices/тестовая интеграция. Реальные деньги включаются после решения открытых коммерческих и эксплуатационных вопросов; payment handler не получает photo keys/spend keys публичного wallet.
- Основание: 07, 10–12; acceptance 12.I/J. Ни один тариф не ослабляет E2EE.

### I15 — эксплуатационная готовность и проверка всего продукта

- Закрыть acceptance A–K, реальные iOS/Android/desktop сценарии, accessibility, low-memory и сеть/storage/DB failure matrix.
- Завершить CSP/XSS/dependency/release review, privacy-preserving metrics/log retention, backup/delete/restore drills и runbooks.
- Зафиксировать измеренные performance targets, deletion SLO, backup residual TTL и provider limitations; security claims соответствуют проверкам. Независимый аудит заявляется только после его проведения.
- Основание: 06, 07, 10, 12, 13. Публичный релиз требует security review, проверенной E2EE/retention и честной матрицы поддержки устройств.

## 6. Зависимости и контрольные результаты

- Критическая цепочка: `I01 → I02 → I03 → I04 → I05 → I06 → I07 → I08`.
- После I08: `I09 → I10 → I11`; совместные роли I12 опираются на уже проверенную capture-only модель, I13 — на I09/I12. Контракт entitlements нужен с I06; реальные платежи I14 добавляются после его проверки.
- **Первая вертикаль (I08):** личный Vault с recovery, безопасной съёмкой до PIN, очередью/облаком, просмотром и удалением. Архитектурный upload-only тест уже существует; полноценного кураторского UI ещё нет.
- **Личный сценарий (I11):** GPS, редактор, безопасный export и ограниченные приватные ссылки.
- **Совместный сценарий (I13):** профиль/задание → исполнитель без archive read keys → кураторская проверка/редактирование.
- **Полный релиз:** обязательные функции и эксплуатационные проверки завершены; платежи включены только с определёнными правилами.

## 7. Правила выполнения каждого PR

- В описании указать конкретные файлы/пункты `_docs`, изменившееся поведение, acceptance из 12, угрозы и Safari/iOS fallback. Названия этапов не подменяют реальный scope PR.
- Security/permissions/storage PR сопровождаются review соответствующих инвариантов 02/06/07 и негативными тестами, которые способны обнаружить утечку, потерю или resurrection.
- Обновлять API/schema/migrations вместе с изменением поведения. Использовать synthetic ciphertext fixtures без личных фотографий/геолокации/секретов.
- Не считать browser automation заменой реальному iPhone/Android. Непроведённые проверки отмечать как pending; надёжность не объявлять по одному desktop happy path.
- Реализационная ветка — `codex/<scope>` от актуальной согласованной базы; commit/push/создание PR выполняются на соответствующем этапе работы. Merge/deploy — отдельные действия в рамках предоставленной пользователем авторизации.

## 8. Вопросы владельцу перед соответствующими этапами

Для текущего планирования ответы не блокируют работу. До зависимых решений нужны:

1. Доступ к реальным iPhone Home Screen PWA и Android PWA для проверок; модель/OS/browser фиксируются в матрице.
2. Предпочтения по strong unlock после reload и convenience unlock; безопасная базовая модель уже описана, короткий PIN единственной защитой ключей быть не может.
3. Production hosting, первый storage provider, допустимый deletion SLO и остаточный срок backup — после технических измерений.
4. Точные GB/цены/сроки prepaid пакетов, правила перекрывающихся покупок, сеть/приём платежей, юрисдикция и refund policy — до I14 с реальными деньгами.

Следующий конкретный шаг: подготовить I01 на базе, содержащей спецификацию, затем завершить ADR/compatibility I02 до реализации криптографического протокола.
