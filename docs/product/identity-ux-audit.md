# Аудит и UX-контракт новой модели PhotoBunker

Дата: 14 октября 2026. Обновление U02–U03: [локальный UI и проверки](ui-through-u03.md). Последнее указание владельца: новые сценарии сначала работают локально, API подключается после UI. Ниже аудит исходного U01; его порядок доставки и прежние пути не заменяют текущую инструкцию. Действующий план: [IMPLEMENTATION_PLAN3](../../IMPLEMENTATION_PLAN3.md).

## Почему прежний сценарий требует изменения

Первый экран требовал создать профиль настроек вместо немедленной съёмки. Слово «Профиль» одновременно предполагало анкету и правила камеры. Задание создавалось через «Профили → Совместная работа», хотя пользователь искал самостоятельную работу. На desktop оболочка была сайтом с sidebar/большими заголовками, а на мобильном длинные настройки вытесняли видоискатель. Постоянного аккаунта и общения нет: bearer-код библиотеки не заменяет Identity, а review comments не заменяют messenger.

## Сохранение и адаптация

| Код | Решение и границы |
| --- | --- |
| `local/camera.ts`, `profiles/image.ts`, `profiles/location.ts` | Сохранить acquisition/processing/location; менять UI без имитации hardware capabilities |
| `local/photos.ts`, `delivery/*`, `server/photos.ts` | Сохранить durable transaction, byte checks, retries, TTL и ack; разрешить стандартный личный capture без preset snapshot |
| `profiles/model.ts`, `store.ts`, `/prototype/profiles` | Сохранить ID/version/snapshots и API; только пользовательский термин меняется на Preset |
| `collaboration/*`, Team/Assignment views | Сохранить ACL/review/retake tests; постепенно отделить Team от пространства пресета и создание Assignment от Team view |
| `PrototypeLibraryController`, Retention, cleanup | Сохранить проверенные access/expiry/idempotency contracts; plaintext prototype остаётся изолированным |
| `server/api.ts` bearer/library identity | Заменить настоящим Account/Device/Auth через явный migration adapter; не переименовывать library UUID в публичный account ID |
| `App.vue`, router, theme/layout | Новая оболочка, Dock, вложенные настройки, camera-default; старые URL сохраняются |
| Service worker | Только публичная оболочка. Новые маршруты добавить в allowlist, API/Matrix/media/секреты не кэшировать |

## Информационная архитектура

| Раздел Dock | Основная задача | Вложенные экраны |
| --- | --- | --- |
| Задания | Получить/создать работу, начать съёмку, проверить результат | Детали, инструкции, участники/права, материалы, обсуждение |
| Сообщения | Общаться с человеком или группой | Список, запросы, чат, звонок, verification/recovery |
| Камера | Снять сразу | Выбор/управление пресетом, категория, очередь/GPS, Quick Exit |
| Фото | Найти и открыть доступные материалы | Фильтры, подробности, редактор/версии, export/share |
| Профиль | Управлять своей анкетой и доступом | Контакты, команды, устройства/recovery, appearance/language/home, storage/infrastructure |

Профиль — не обязательная анкета перед камерой. Пресеты — опциональные настройки, не папки. Команда — постоянные люди, задание — работа, Vault — права и ключи. На стадии U01 профиль даёт доступ к уже работающим настройкам и честно сообщает отсутствие постоянного аккаунта; никакого вымышленного ID.

## Контракты экранов

- Camera: live view, достижимый shutter, стандартный capture без API-создания пресета; фото сначала durable local, затем verified server. Первый доступ к hardware только по явному нажатию. Категории/список кадров появляются лишь при выбранном контексте. TTL стандартного личного кадра — 14 суток, GPS выключен, дата включена, camera metadata выключена.
- Presets: создать/копировать/архивировать и применить. Архивация не удаляет фотографии. Старый snapshot сохраняет первоначальные правила. API/schema names пока не переименовывать.
- Assignments: список с ролью/сроком/состоянием; самостоятельное создание — U03. Текущий путь через общий пресет остаётся переходным и не объявляется финальным Team UX.
- Messages: до B02 явное unavailable state; нет демо-переписки, fake send/read/call. В production будущий экран различает отсутствие аккаунта, provisioning failure, disconnected и пустую историю.
- Profile: существующие настройки и preferences работают. Постоянный ID/профиль/контакты/devices доступны только после B01, а не localStorage mock.
- Photos: только доступные настоящие записи, пустая галерея предлагает камеру, фильтры не изменяют ACL. Expired/revoked previews освобождаются.

## Визуальная система

Спокойные нейтральные поверхности, один читаемый акцент, компактная типографика, моноширинный текст лишь для технических кодов. Единые radii/границы/интервалы. Dock постоянно доступен; камера выделена центральной кнопкой. Desktop использует ширину для материалов и редактора, без отдельной модели навигации. Dark/light/system меняют реальные tokens; no mandatory remote fonts/assets. Touch targets ≥44 px, видимый focus, reduced motion, safe areas и 320 px без горизонтальной прокрутки.

Никаких «защищено», lock badge или cloud green без соответствующих механизмов. Локальный prototype disclosure остаётся видимым; детали разработки не занимают весь видоискатель.

## Противоречия и принятые решения

| Старое/неоднозначное требование | Решение |
| --- | --- |
| Profile-first и Profiles в Dock | Account model; Camera default, Presets внутри камеры |
| Сначала Matrix infrastructure в новом документе | Последнее указание владельца: UX сначала; архитектура Identity/Matrix фиксируется до кода, интеграции идут после UX |
| Team = пространство профиля | Только временная совместимость; явные Team/Assignment/Vault relations в B03 |
| No-delete и 21/30 дней | Не нарушают тарифные максимумы; в UI не добавлять без enforcement |
| Keep original? | Пока immutable original сохраняется; destructive policy требует отдельного проектирования |
| Thumbnail-only | Самостоятельное ограничение доставки/ключей, не размер `<img>` |
| Один Recovery Key | Не обещать до проверенного совместного recovery; разные E2EE системы имеют разные ключи |
| «Сначала UI» | Рабочие доступные действия сейчас; архитектурные сценарии неподключённых сервисов документируются без fake success |

## Git и материалы

Прочитаны описания [PR #1](https://github.com/1troitsky/photobunker/pull/1)–[PR #6](https://github.com/1troitsky/photobunker/pull/6); все открыты, цепочка `main → docs → local-foundation → protocol/browser → local-app → server-library → profile-first`. Последний опубликованный commit `78592d1`. Рабочие этапы 2/3 и документы владельца были незакоммичены до начала U01; не сбрасывались.

Ссылка на полную переписку из Identity-документа не открылась через доступный web reader; локальный документ прочитан полностью и принят как источник требований. Внешний текст переписки не считается изученным.

## Результат U01

Реализовано в локальной ветке `codex/identity-ux-foundation`:

- Dock из пяти разделов; camera-first и стандартный приватный кадр без создания пресета. Правила сохранённых пресетов и snapshots продолжают действовать.
- Camera Presets находятся в `/camera/presets`; старые `/profiles` URL остаются aliases. Существующая совместная работа доступна из пресета, без объявления её финальной Team-моделью.
- Новый Profile отдельно от пресетов: реальные theme/startup preferences, статистика и доступ к существующим настройкам. Нет вымышленного постоянного ID или имитации регистрации.
- Dark/light/system, RU/EN и configurable start/last section сохраняются. В last section нет ID фотографий, заданий или URL-секретов. Отказ persistence виден; повреждённая preference не мешает запуску.
- Первый офлайн-кадр имеет durable upload intent до появления library/clock. При первом подключении private initial capture получает привязку один раз, без увеличения исходного local deadline. Старые/совместные missing-anchor captures сохраняют clock error, чужая библиотека не подхватывается. Это отдельная временная политика plaintext-прототипа, не утверждённая криптографическая схема времени; см. [API contract](../../contracts/local-prototype-api.md).
- Async creation старой библиотеки не перезаписывает уже восстановленный доступ.
- Messages честно показывает отсутствие подключённой переписки. Matrix SDK, сервер и звонки этим изменением не добавлены. Production guard сохранён.

Проверено 14 октября 2026:

| Проверка | Результат |
| --- | --- |
| Полный `./scripts/dev check` | 42 API tests / 466 assertions, Pint (53 files), private/signed S3, 50 client tests, typecheck/build — passed |
| `check-identity-ux.mjs`, Chromium/WebKit | Первый camera-first запуск, offline/IDB/reload/SHA-256, default auto-delivery, отсутствие пресетов, темы/home/язык, old routes, 320/390/768/1440 px — passed |
| `check-profiles.mjs`, Chromium | JPEG geometry/EXIF, snapshot/history, ограничения полей, delayed GPS, второй браузер, mobile layout — passed |
| `check-collaboration.mjs`, Chromium | Раздельные actors, upload-only, review/reply/retake, revoke и viewer controls — passed |
| `check-delivery.mjs`, Chromium/WebKit | Offline/restart, lost acknowledgements, original integrity, filters/bulk, TTL/cleanup — passed |
| Визуальный просмотр screenshots | Камера и Profile в dark/light на 390 px; invite/access codes не снимались |
| Настоящие iPhone/Android PWA | Pending, desktop WebKit не подменяет устройство |

При проверке layout повторные жёсткие переходы во время API-запросов давали в WebKit ошибки отменённых запросов. Тест использует обычную SPA-навигацию и ждёт завершения загрузки перед измерением: исключения приложения не фильтруются. Новый browser script пока запускается отдельно; обычные клиентские tests входят в существующий CI. Старые browser scripts адаптированы к новым названиям и навигации, их исходные проверки сохранены.

U01 не объявляет готовыми постоянные аккаунты, Matrix, PIN/E2EE, независимую Team-модель, editor или звонки. Следующий пользовательский блок — U02 (камера/фото/настройки пресета), затем U03 (самостоятельное задание).
