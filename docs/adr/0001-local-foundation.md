# ADR 0001 — автономное локальное окружение I01

Статус: принято для локального каркаса I01. Дата: 12 октября 2026 года.

Основание: [_docs/11](../../_docs/11-architecture-api-contracts.md), [_docs/12](../../_docs/12-quality-acceptance-and-operations.md), [_docs/13](../../_docs/13-decisions-and-agent-contract.md) и [план I01](../../IMPLEMENTATION_PLAN.md).

## Проблема

Нужен воспроизводимый запуск client/API/БД/S3 в одной рабочей папке, без облачного аккаунта и обязательной установки PHP/Composer/PostgreSQL на Mac. После начальной загрузки зависимостей приложение должно работать с локальными сервисами без обязательного внешнего интернета. При этом контейнерный dev workflow не должен становиться требованием к production.

## Варианты

1. Нативные PHP/Composer/PostgreSQL и локальный storage process. Меньше контейнеров, но больше различий host environments и ручной подготовки.
2. Compose с локальными PostgreSQL и standalone S3, PHP/Node в контейнерах. Одинаковые команды на OrbStack и Linux/CI, ценой зависимости dev workflow от container runtime.
3. Облачные PostgreSQL/S3 для разработки. Ближе к конкретному provider, но требует аккаунта, сети и работы с внешними credentials.

Выбран вариант 2. Нативная разработка остаётся возможной альтернативой; production topology будет отдельным решением.

## Решение

- Один репозиторий: `apps/web` (Vue 3 + TypeScript + Vite), `apps/api` (Laravel 13 + PHP 8.4), общие contracts и отдельные ADR/runbooks.
- Один локальный origin через Nginx: Vue shell и JSON API. На host `http://localhost:8080`, в OrbStack дополнительно `https://photobunker.orb.local`.
- PostgreSQL 17, database queue/cache, отдельные процессы Laravel worker/scheduler. Redis добавляется при подтверждённой необходимости.
- Garage 2.4.1 single-node с private bucket, persistent metadata/data volumes и автоматически подготовленными credentials/bucket/CORS. Стандартный S3 adapter сохраняет заменяемость provider.
- Исходники монтируются из checkout; Composer/npm dependencies устанавливаются по lockfiles. Ключевые PHP/Composer/PostgreSQL/Garage images закреплены digest в инфраструктурных файлах.
- `scripts/dev setup` подготавливает окружение; `up/down/status/check/smoke/offline/api/web` дают общий интерфейс для разработчика и CI.
- `compose.offline.yaml` изолирует сеть API/web/БД/Garage/workers. Gateway дополнительно сохраняет обычную ingress-сеть и proxy только к фиксированным локальным upstreams, чтобы браузер мог открыть приложение. Это не изоляция всех контейнеров и не эмуляция мобильной PWA без связи.
- Root/API env генерируются локально и игнорируются Git; в репозиторий попадают только templates без секретов.

Garage выбран для локального S3, поскольку он [не требует внешних сервисов](https://garagehq.deuxfleurs.fr/documentation/reference-manual/features/) и имеет [single-node/container quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/). Нужные базовые операции, presigned URLs, multipart и CORS отражены в его [матрице S3 compatibility](https://garagehq.deuxfleurs.fr/documentation/reference-manual/s3-compatibility/). Совместимость с конкретным SDK/checksum protocol проверяется тестами; это не обещание полного совпадения с AWS/R2.

## Компромиссы и границы безопасности

Начальные image/package downloads требуют интернета. Подготовленный runtime не требует внешнего storage или license server; обновления зависимостей снова требуют сети.

Single-node Garage не даёт production redundancy. PostgreSQL и Garage credentials нужны только инфраструктуре и не являются E2EE keys. В I01 нет пользовательского crypto/auth/camera/upload lifecycle: S3 checks работают с синтетическими bytes. Выбор криптографического протокола, key hierarchy и сильного unlock относится к I02 и не принимается этим ADR.

Опубликованные host ports ограничены loopback; security headers и CSP относятся к development gateway. PHP/Vite dev servers и этот Compose layout не публикуются в интернет как production. OrbStack HTTPS может потребовать доверия локальному CA. Телефонные LAN/DNS/HTTPS-настройки и реальные iOS/Android tests остаются pending.

`down` сохраняет volumes. Удаление volumes разрушает данные и не входит в обычный workflow. S3 `HEAD` после `DELETE` подтверждает отсутствие доступного объекта, а не физическое уничтожение каждого byte на носителе; полноценные retention/deletion/restore guarantees вводятся позже.

Смена regular/internal network выполняется с остановкой и пересозданием контейнеров/сетей, без удаления volumes. Прямой host port Garage в offline-режиме недоступен, storage checks выполняются из API-контейнера. Browser S3 integration в I01 отсутствует и будет проверяться отдельно.

JSON API выбран для отделения клиентской навигации и будущей локальной очереди от server-rendered page state. Inertia совместима с PWA/E2EE, но для данного shell не даёт достаточного упрощения; отдельный sync API всё равно понадобится. Выбор не требует отдельных repo/domain/deploy.

## Проверки

CI выполняет локальный `setup`, полный `check` один раз, `smoke`, включает внутреннюю сеть и повторяет `smoke`, затем возвращает обычную сеть через `up` и снова проверяет `smoke`. Smoke проверяет shell/API/DB readiness и S3 operations; будущие browser/multipart/provider/device tests имеют собственные acceptance и не считаются выполненными этим pipeline. Teardown выполняется всегда без удаления volumes.

Используются официальные actions, закреплённые по reviewed release commit: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) и [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0). Checkout не сохраняет token, workflow использует read-only permissions, dependency cache выключен. Env, полный Compose config и logs не публикуются артефактами.

Пока PR №1 открыт, базовая ветка I01 — `docs/product-foundation`; переход на `main` выполняется после включения нормативной спецификации.
