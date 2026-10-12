# Локальная разработка PhotoBunker

Runbook для I01. Окружение содержит shell приложения и инфраструктуру; пользовательские фотографии, E2EE, auth, PIN, камера и удаление по TTL в нём ещё не реализованы. Для служебных проверок используются случайные синтетические bytes.

## Подготовка и первый запуск

На host нужны Git, Node.js 22 и Docker CLI с Compose v2. Docker Engine должен быть запущен. На macOS рекомендуемый runtime — OrbStack; на Linux подходит Docker Engine с Compose. PHP 8.4, Composer, npm для frontend и PostgreSQL работают в контейнерах.

```sh
node --version
docker compose version
./scripts/dev setup
```

Первый запуск требует интернета для container images, системных пакетов, Composer и npm dependencies. `setup` устанавливает зависимости по lockfiles, генерирует env, поднимает PostgreSQL/Garage, выполняет миграции, настраивает bucket CORS, затем запускает остальные сервисы и ждёт health checks. `setup` также подходит для подготовки зависимостей после изменения lockfiles; это не команда ежедневного запуска без сети.

Открыть [http://localhost:8080](http://localhost:8080). Для OrbStack дополнительно настроен [https://photobunker.orb.local](https://photobunker.orb.local): первый визит может вызвать запрос доверия к локальному CA. Если домен недоступен, проверить работающий OrbStack и его настройку доступа к container domains. [Документация OrbStack](https://docs.orbstack.dev/docker/domains).

В текущей проверке на Mac `localhost:8080` работает, а прямые container domains/IP завершаются `No route to host` при включённых network bridge/HTTPS. Поэтому HTTPS этого окружения пока не подтверждён. Используйте проверенный localhost; диагностика bridge/ARP относится к настройкам OrbStack/macOS, а не к Laravel. Похожий случай описан в [OrbStack issue 2676](https://github.com/orbstack/orbstack/issues/2676).

## Команды

Все команды выполняются из корня репозитория.

| Команда | Действие |
| --- | --- |
| `./scripts/dev setup` | Подготовить env, образы, зависимости, миграции, bucket/CORS и запустить контур |
| `./scripts/dev up` | Запустить подготовленные сервисы и дождаться health checks; вернуть обычную сеть после `offline` |
| `./scripts/dev down` | Остановить и удалить контейнеры/сеть, сохранив volumes |
| `./scripts/dev status` | Показать состояние сервисов |
| `./scripts/dev check` | Выполнить API tests, Pint, storage check и frontend checks/build |
| `./scripts/dev smoke` | Проверить доступность shell, health/readiness и операции локального S3 |
| `./scripts/dev offline` | Изолировать сеть API/web/БД/S3/workers; сохранить browser ingress через gateway |
| `./scripts/dev api <command>` | Выполнить команду внутри уже запущенного API-контейнера |
| `./scripts/dev web <command>` | Выполнить команду внутри уже запущенного web-контейнера |

Примеры:

```sh
./scripts/dev api php artisan migrate
./scripts/dev api php artisan photobunker:storage-check --signed
./scripts/dev web npm run check
```

`api` и `web` запускают переданную команду без интерактивного TTY. Для ручной интерактивной сессии можно использовать `docker compose exec api sh` или `docker compose exec web sh`.

## Сервисы и адреса

| Сервис | Версия/роль | Адрес |
| --- | --- | --- |
| `gateway` | Nginx, единый web/API origin | Host `http://localhost:8080`; OrbStack `https://photobunker.orb.local` |
| `web` | Node.js 22, Vue 3/TypeScript/Vite dev server | Внутри Compose `http://web:5173` |
| `api` | PHP 8.4, Laravel 13 | Внутри Compose `http://api:8000` |
| `worker` | Laravel database queue worker | Порты не публикуются |
| `scheduler` | Laravel scheduler | Порты не публикуются |
| `postgres` | PostgreSQL 17 | Внутри Compose `postgres:5432`; host port не публикуется |
| `garage` | Garage 2.4.1, single-node S3 | API endpoint `http://garage:3900`; host `http://localhost:3900`; OrbStack `https://s3.photobunker.orb.local` |

Host ports приложения и S3 привязаны к `127.0.0.1`. Это локальное окружение, не готовая конфигурация публикации в LAN или интернет. OrbStack предоставляет собственный доступ к container domains; не использовать его как production reverse proxy.

Адреса S3 на host относятся к обычному сетевому режиму. В `offline` Garage остаётся только во внутренней сети: доступ API к `http://garage:3900` сохраняется, прямой host port S3 недоступен. Browser uploads и browser S3 integration в I01 ещё нет.

Служебный `/api/v1/health` подтверждает работу API-процесса. `/api/v1/ready` проверяет доступность БД. S3 проверяется отдельно командой `photobunker:storage-check`; одна readiness-проверка не подтверждает исправность storage.

В I01 storage check проверяет PUT/HEAD/GET/DELETE и отсутствие объекта после удаления, а `--signed` дополнительно проверяет краткоживущие presigned PUT/GET и запрет анонимного чтения. Это не подтверждение physical erasure на носителе. Multipart, production checksums, browser CORS и поведение production-провайдера требуют отдельных contract tests в соответствующих следующих PR.

## Локальные настройки и секреты

`scripts/setup-local.mjs` создаёт корневой `.env` и, если его ещё нет, `apps/api/.env`. Новые файлы получают права `0600`; PostgreSQL password, Garage credentials/RPC secret и Laravel application key генерируются случайно. Эти значения не выводятся командой настройки и не должны попадать в Git, screenshots или артефакты CI.

Корневой env содержит параметры Compose и bootstrap Garage; API env содержит настройки Laravel, БД и S3. Повторный setup сохраняет существующий API env. Если меняете порты или credentials вручную, синхронизируйте соответствующие значения в обоих файлах. Изменение env не меняет credentials уже созданной БД/ключей storage автоматически.

В API предусмотрены разные endpoint settings: `AWS_ENDPOINT` доступен контейнеру, `AWS_BROWSER_ENDPOINT` предназначен для браузера. Подпись presigned URL зависит от исходного host; нельзя подписать URL для `garage:3900`, затем заменить hostname на `localhost`. При HTTPS-приложении браузерный S3 endpoint также должен быть HTTPS. Текущий shell не загружает файлы из браузера; полноценная browser integration будет проверяться отдельно.

При изменении разрешённых origins обновить `AWS_CORS_ALLOWED_ORIGINS`, пересоздать API-процессы и применить CORS:

```sh
./scripts/dev up
./scripts/dev api php artisan photobunker:storage-configure
```

Не публиковать вывод `env`, `.env`, `docker inspect` или полного `docker compose config`: там могут оказаться credentials. Для проверки Compose без раскрытия значений подходит `docker compose config --quiet`; для состояния — `./scripts/dev status`. Перед передачей любых дополнительных логов проверить их содержимое.

## Проверка без внешних сервисов

После успешного setup:

```sh
./scripts/dev check
./scripts/dev smoke
./scripts/dev offline
./scripts/dev smoke
./scripts/dev up
./scripts/dev smoke
```

`compose.offline.yaml` делает сеть `local` внутренней: API, web, PostgreSQL, Garage, worker и scheduler продолжают взаимодействовать друг с другом, а их внешний egress блокируется. Только Nginx gateway дополнительно подключается к обычной сети `ingress`, чтобы приложение оставалось доступно браузеру. Его proxy upstreams фиксированы на локальные API/web; gateway не является forward proxy. Все контейнеры целиком не изолируются.

Повторный smoke проверяет локальный shell/API/storage через эту топологию. `up` возвращает стандартную сеть, последний smoke проверяет обратный переход. При смене режима helper останавливает и пересоздаёт контейнеры/сети; named volumes сохраняются. Полный test suite повторять для этих проверок не нужно.

Это проверка отсутствия обязательных внешних runtime services; она не заменяет проверку PWA при отключённой сети телефона, browser storage eviction или Background Sync. Host/browser, gateway ingress и сам OrbStack не изолируются данным override. Интернет снова понадобится для обновления images/dependencies; `setup` также восстанавливает обычный сетевой режим перед установкой зависимостей.

## Сохранение данных и диагностика

Именованные volumes `postgres-data`, `garage-meta`, `garage-data` сохраняются при `down`, restart и пересоздании контейнеров. Названия имеют Compose project prefix, по умолчанию `photobunker`. Изменение `COMPOSE_PROJECT_NAME` выбирает другой набор volumes. Исходники и установленные `vendor`/`node_modules` находятся в bind mounts рабочего checkout.

Обычная остановка:

```sh
./scripts/dev down
```

Не добавлять `--volumes`/`-v` к этой команде: это уничтожит локальную БД и storage. Volume cleanup не входит в setup, CI teardown или команды повседневной разработки.

Если сервис не готов, начать с `./scripts/dev status`. Проверить свободное место, занятые host ports и соответствие локальных env. После изменения зависимостей выполнить `setup`. После изменения database credentials необходимо осознанно согласовать их с существующей БД; удаление volumes не является автоматическим исправлением.

## Телефон, PWA и границы проверки

Реальные iPhone Home Screen PWA и Android installed PWA — **pending**. `localhost` на телефоне указывает на сам телефон, а `.orb.local` и доверие к CA на Mac не означают автоматическую доступность с телефона. Для device tests нужны отдельно настроенные LAN routing/DNS, доступный телефону S3 hostname и HTTPS с доверенным на этом устройстве сертификатом. Не обходить предупреждение сертификата как подтверждение корректного secure context.

Нынешние PHP/Vite development servers, single-node Garage и development CSP не предназначены для production. Release headers/CSP, deploy, настоящие recovery/auth/E2EE/capture, retention/restore и мобильная матрица будут разработаны в следующих этапах плана.

## CI и база PR

Workflow использует Ubuntu runner, Node.js 22 и Docker Compose. Порядок: `setup` → один `check` → `smoke` → `offline` → `smoke` → `up` → `smoke` → always teardown без удаления volumes. Token имеет только `contents: read`, checkout не сохраняет credentials; env, resolved config и logs не загружаются артефактами.

Пока PR №1 со спецификацией открыт, I01 направляется в `docs/product-foundation`; workflow проверяет pull requests в эту ветку и `main`. После merge спецификации реализационный PR можно перебазировать на `main`.
