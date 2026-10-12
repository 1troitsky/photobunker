# PhotoBunker

PhotoBunker — privacy-first камера и зашифрованное фотопространство в устанавливаемой PWA. Нормативные требования находятся в [_docs/README.md](_docs/README.md); порядок будущих PR — в [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Сейчас доступна **первая рабочая локальная версия**: камера, сохранение в браузере, галерея, просмотр, названия и заметки, избранное, поиск, скачивание и удаление. Аккаунты, серверная загрузка, шифрование и retention ещё не подключены. Это промежуточный этап разработки: локальные фото хранятся **без шифрования**, что явно указано в интерфейсе.

Чтобы попробовать уже запущенное приложение, откройте [http://localhost:8080](http://localhost:8080), нажмите **«Попробовать без камеры»**, затем круглую кнопку съёмки и **«Галерея»**. Снимок останется после перезагрузки страницы. **«Включить камеру»** запускает настоящую камеру, если она доступна. Телефон для первого знакомства не нужен. [Возможности и проверки](docs/operations/local-prototype.md).

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

Открыть [http://localhost:8080](http://localhost:8080) или, при работающем OrbStack, [https://photobunker.orb.local](https://photobunker.orb.local). При первом посещении HTTPS OrbStack может запросить установку доверенного локального сертификата.

```sh
./scripts/dev status
./scripts/dev down
```

`down` сохраняет данные PostgreSQL и Garage. Все команды, проверка без внешней сети и ограничения телефона описаны в [локальном runbook](docs/operations/local-development.md).

## Архитектура I01

| Компонент | Назначение |
| --- | --- |
| `apps/web` — Vue 3, TypeScript, Vite, Node.js 22 | Локальная камера и галерея, RU/EN, основа PWA |
| `apps/api` — Laravel 13, PHP 8.4 | JSON API, миграции, служебные проверки |
| PostgreSQL 17 | База приложения, database queue/cache |
| Garage 2.4.1, один локальный узел | Private S3-compatible bucket для разработки |
| Worker и scheduler | Процессы Laravel для будущих серверных jobs |
| Nginx gateway | Один origin для web и `/api`, локальные security headers |

Redis и Inertia на этом этапе не нужны. Клиент использует JSON API, а данные S3 доступны через заменяемый storage adapter. Контейнерная схема предназначена для разработки; production не обязан использовать Docker или Garage. Решение и компромиссы записаны в [ADR 0001](docs/adr/0001-local-foundation.md).

Корневой `.env` и `apps/api/.env` генерируются локально, игнорируются Git и содержат credentials. Коммитить можно только `.env.example`, lockfiles и конфигурацию без секретов.

## Проверки и работа через PR

CI запускает тот же `setup`, один полный `check`, затем `smoke`, изолирует сеть API/web/БД/S3/workers и повторяет только `smoke`. Gateway сохраняет отдельную ingress-сеть для браузера. Затем CI возвращает обычную сеть и ещё раз проверяет smoke; остановка выполняется всегда, без удаления volumes. Содержимое env, полный resolved Compose config и диагностические логи не публикуются артефактами.

Проверки реальных iPhone Home Screen PWA и Android PWA остаются **pending**. Desktop/CI не подтверждают качество камеры, устойчивость очереди или фоновые возможности мобильных браузеров. Доступ телефона по LAN и доверенный на телефоне HTTPS потребуют отдельной настройки.

В I02 предложены [формат объектов](docs/adr/0002-object-encryption-format.md), [ключи и unlock](docs/adr/0003-keys-unlock-and-capture.md), [TTL и restore](docs/adr/0004-retention-clock-access-and-restore.md). Эти решения требуют review до продуктового codec. [Изолированный стенд](tools/browser-spike/README.md) проверяет CSP/WASM, library worker, IndexedDB и non-extractable upload key; [матрица](docs/operations/browser-compatibility.md) отделяет desktop результаты от ещё не проверенных устройств. Стенд запускается отдельно на порту 5180 и не обращается к API/S3 приложения.

[PR №1 со спецификацией](https://github.com/1troitsky/photobunker/pull/1) и [draft PR №2 с I01](https://github.com/1troitsky/photobunker/pull/2) пока открыты. База I01 — `docs/product-foundation`; I02 в `codex/protocol-and-browser-spike` основан на `codex/local-foundation`. После merge предшествующих PR базы последовательно меняются на `main`.
