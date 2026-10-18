# PhotoBunker

PhotoBunker — устанавливаемая PWA: мгновенная камера, фотографии, задания и общение вокруг постоянного аккаунта. Актуальная модель — [Identity & Matrix Integration](Identity%20%26%20Matrix%20Integration.md) и [_docs/14](_docs/14-identity-matrix-and-product-model.md). Действующий план — [IMPLEMENTATION_PLAN3.md](IMPLEMENTATION_PLAN3.md): сначала UX/UI, затем внутренние интеграции. Прежние планы сохранены как история.

Реализованы UI U01–U04 и локальная интеграция B01–B05: Dock **Задания · Сообщения · Камера · Фото · Профиль**, компактная камера, пресеты, галерея/редактор и самостоятельные задания. По умолчанию открывается [камера](http://localhost:8080/camera); пресет не обязателен. **«Попробовать без камеры» → затвор** сохраняет настоящий DEMO JPEG на устройстве. Для использования приложения нужен аккаунт; гостевой режим закрыт. После входа они отправляются в личное хранилище или задание с серверной проверкой прав; ошибки отправки показываются отдельно от локального сохранения. Существующие данные старого прототипа и его адаптеры сохранены.

В [Профиле](http://localhost:8080/profile) можно выбрать dark/light/system и стартовый раздел; язык и доступ к библиотеке находятся в настройках. В профиле работают постоянный ID, создание/восстановление без email/пароля, необязательная анкета с видимостью полей, контакты/блокировки и отзыв устройств. **Для аккаунта, фотографий и переписки используется один пользовательский ключ. Приложение хранит его на доверенном устройстве и автоматически управляет внутренними ключами фото/Matrix. После явного выхода вход требует ключ; сохранённые аккаунты не предлагаются без него. Необязательный PIN закрывает всё приложение.** Временный код библиотеки не является постоянным PhotoBunker ID или ключом восстановления. Новые аккаунтные фото шифруются на устройстве; старые копии переносятся явно. Старые plaintext адаптеры доступны для явного переноса существующих данных. Production guard сохранён.

[Аудит, UX-контракт и проверки U01](docs/product/identity-ux-audit.md). Актуальный сценарий U02–U03: `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/photobunker-playwright-browsers node tools/browser-spike/check-ui-workspace.mjs` при работающем локальном окружении.

## UI и интеграции до B04

Сначала завершаем пользовательские сценарии, затем подключаем API под них. B03 подключает реальные команды, приглашения, задания, photo grants и связанные обсуждения. Перенос прежних данных запускается явно из Профиля; исходники сохраняются, старые участники не получают права автоматически. [Сценарии B03](docs/operations/account-workspace.md). B04: **Профиль → Безопасность → Защита фотографий** — PB1-подтверждение, отдельный PB4, encrypted capture/queue, scoped envelopes, strong unlock, recovery/device linking и проверяемый перенос старых файлов. [Сценарии и точные ограничения B04](docs/operations/photo-protection.md). Backend в U02–U03 не расширялся; по указанию владельца в B01 добавлены Identity API и управляемый Matrix. [Запуск и восстановление Identity](docs/operations/identity-matrix-local.md).

Открыть [Камеру](http://localhost:8080/camera). Пресеты — кнопка слева от затвора; новое задание — «Задания → +»; команды — «Профиль → Команды». [Описание результата и границы](docs/product/ui-through-u03.md). Уточнения U03: явное редактирование выбранной команды, кисть/карандаш/ластик и переносимый текст, данные/координаты снимка, пресет/автор и [правила внешнего просмотра](docs/product/photo-context-and-sharing.md).

Категории общие для текущей библиотеки/устройства и не зависят от пресета. Ограниченный список может задаваться только правилами конкретного задания. [Фактические возможности камеры и проверка телефона](docs/operations/camera.md).

## Локальный запуск

Нужны Node.js 22, Git и работающий Docker Engine с Compose v2. На macOS рекомендуемый вариант — OrbStack; PHP, Composer и PostgreSQL устанавливать на host не требуется.

Из корня репозитория:

```sh
./scripts/dev setup
./scripts/dev check
./scripts/dev smoke
```

Первый `setup` скачивает образы и зависимости, создаёт локальные credentials, выполняет миграции, готовит S3 bucket/CORS и запускает сервисы. После этой подготовки повседневный запуск не требует облачного аккаунта или внешнего сервиса:

```sh
./scripts/dev up
```

Matrix запускается отдельно после приложения: `./scripts/dev matrix`. Камера не зависит от его готовности; локальный тестовый `server_name` не выбирает домен production.

Открыть [http://localhost:8080](http://localhost:8080) или, при работающем OrbStack, [https://photobunker.orb.local](https://photobunker.orb.local). При первом посещении HTTPS OrbStack может запросить установку доверенного локального сертификата.

```sh
./scripts/dev status
./scripts/dev down
```

`down` сохраняет данные PostgreSQL, Garage и Matrix. Все команды, проверка без внешней сети и ограничения телефона описаны в [локальном runbook](docs/operations/local-development.md).

## Архитектура I01

| Компонент | Назначение |
| --- | --- |
| `apps/web` — Vue 3, TypeScript, Vite, Node.js 22 | Локальная камера и галерея, RU/EN, основа PWA |
| `apps/api` — Laravel 13, PHP 8.4 | JSON API, миграции, служебные проверки |
| Tuwunel 1.9.4, отдельный Compose profile | Управляемые Matrix accounts/devices; E2EE chat и key backup — B02 |
| PostgreSQL 17 | База приложения, database queue/cache |
| Garage 2.4.1, один локальный узел | Private S3-compatible bucket для разработки |
| Worker и scheduler | Процессы Laravel для будущих серверных jobs |
| Nginx gateway | Один origin для web и `/api`, локальные security headers |

Redis и Inertia на этом этапе не нужны. Клиент использует JSON API, а данные S3 доступны через заменяемый storage adapter. Контейнерная схема предназначена для разработки; production не обязан использовать Docker или Garage. Решение и компромиссы записаны в [ADR 0001](docs/adr/0001-local-foundation.md).

Корневой `.env` и `apps/api/.env` генерируются локально, игнорируются Git и содержат credentials. Коммитить можно только `.env.example`, lockfiles и конфигурацию без секретов.

## Проверки и работа через PR

CI запускает тот же `setup`, полный `check`, `smoke`, UI при недоступном API, реальный Identity/Matrix в Chromium/WebKit с outage/restore, сохранение анкеты, E2EE чаты/SAS/backup recovery и capture pipeline на синтетической камере. Затем изолирует сеть API/web/БД/S3/workers и повторяет только `smoke`. Gateway сохраняет отдельную ingress-сеть для браузера. Затем CI возвращает обычную сеть и ещё раз проверяет smoke; остановка выполняется всегда, без удаления volumes. Содержимое env, полный resolved Compose config и диагностические логи не публикуются артефактами.

Проверки реальных iPhone Home Screen PWA и Android PWA остаются **pending**. Desktop/CI не подтверждают качество камеры, устойчивость очереди или фоновые возможности мобильных браузеров. Доступ телефона по LAN и доверенный на телефоне HTTPS потребуют отдельной настройки. [Протокол мобильной проверки](docs/operations/mobile-acceptance.md).

В I02 предложены [формат объектов](docs/adr/0002-object-encryption-format.md), [ключи и unlock](docs/adr/0003-keys-unlock-and-capture.md), [TTL и restore](docs/adr/0004-retention-clock-access-and-restore.md). Их продуктовая реализация и внутренний review описаны в [ADR 0009](docs/adr/0009-photo-e2ee-and-strong-unlock.md); независимый review остаётся release gate. [Изолированный стенд](tools/browser-spike/README.md) проверяет CSP/WASM, library worker, IndexedDB и non-extractable upload key; [матрица](docs/operations/browser-compatibility.md) отделяет desktop результаты от ещё не проверенных устройств. Стенд запускается отдельно на порту 5180 и не обращается к API/S3 приложения.

[PR №1 со спецификацией](https://github.com/1troitsky/photobunker/pull/1) и [draft PR №2 с I01](https://github.com/1troitsky/photobunker/pull/2) пока открыты. База I01 — `docs/product-foundation`; I02 в `codex/protocol-and-browser-spike` основан на `codex/local-foundation`. После merge предшествующих PR базы последовательно меняются на `main`.

Переписка: [как начать, два ключа и восстановление после выхода](docs/operations/matrix-messaging.md).

Постоянный вход, PIN всего приложения, @username, архив/поиск/выбор/удаление переписки: [актуальный сценарий](docs/operations/messenger-actions.md).

Редактор и передача B05: [облачные зашифрованные версии, маски и приватные ссылки](docs/operations/editor-sharing.md). PIN по-прежнему необязателен и закрывает приложение целиком.

Звонки B06: `./scripts/dev rtc` после запуска Matrix. [Личные/групповые аудио- и видеозвонки, проверка E2EE и ограничения стенда](docs/operations/matrixrtc-calls.md).

Актуальный сценарий: [один ключ аккаунта](docs/operations/single-account-key.md).
