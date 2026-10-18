# PhotoBunker / _docs

**PhotoBunker** — независимая privacy-first облачная камера и зашифрованное фотопространство (PWA). Документация здесь — **единый источник требований для AI-агента**, а не план реализации.

**Обновление 14 октября 2026:** актуальная модель Account/Camera Preset/Assignment/Team и Matrix описана в [14-identity-matrix-and-product-model.md](14-identity-matrix-and-product-model.md). Она уточняет прежние понятия и навигацию по новым документам владельца. Текущий порядок работ — [IMPLEMENTATION_PLAN3](../IMPLEMENTATION_PLAN3.md): UX/UI, затем внутренние интеграции. Старые планы сохранены как история.

**Читать:** сначала актуальное уточнение 14, затем 01 → 13; для security/storage changes обязательно сверяться с 06, 07 и 12. Базовая концепция сформирована до 11 октября, модель аккаунта и коммуникаций обновлена 14 октября 2026 года.

## Индекс спецификаций

| Файл | Содержание |
|---|---|
| [01-product-foundation.md](01-product-foundation.md) | Замысел, целевая модель, личные/совместные сценарии, границы, честные обещания |
| [02-domain-model-and-permissions.md](02-domain-model-and-permissions.md) | Account, Device, Vault, Asset, Profile, Assignment, roles, invariants |
| [03-ui-ux.md](03-ui-ux.md) | Native-feeling PWA, Camera-first, PIN, интерфейс, предупреждения, Quick Exit |
| [04-camera-capture-and-sync.md](04-camera-capture-and-sync.md) | Camera APIs, тихий затвор, локальная очередь, upload lifecycle и статусы |
| [05-geolocation-metadata.md](05-geolocation-metadata.md) | GPS догоняет фото, accuracy, time offsets, encrypted sidecar, неточный GPS |
| [06-security-cryptography.md](06-security-cryptography.md) | E2EE, key hierarchy, восстановление, угрозы браузера, PIN ≠ сильное шифрование |
| [07-storage-retention-deletion.md](07-storage-retention-deletion.md) | S3 adapter, TTL, Free 14 days, paid 3mo/≥12mo, 1h deletion, backups |
| [08-photo-editor-and-versions.md](08-photo-editor-and-versions.md) | Текст, рисование, корректировки, ретушь конфиденциальных участков, версии |
| [09-sharing-profiles-collaboration.md](09-sharing-profiles-collaboration.md) | Ссылки, совместные Vault, submitter/curator, профили и задания |
| [10-plans-crypto-payments.md](10-plans-crypto-payments.md) | Анонимные аккаунты, разовая покупка места за crypto, отсутствие подписок |
| [11-architecture-api-contracts.md](11-architecture-api-contracts.md) | Слои системы, Vue PWA, thin API, storage, предложенный протокол endpoints |
| [12-quality-acceptance-and-operations.md](12-quality-acceptance-and-operations.md) | Проверки, матрица ошибок, reliability, безопасность, операции |
| [13-decisions-and-agent-contract.md](13-decisions-and-agent-contract.md) | Подтверждённые решения, открытые вопросы и правила работы AI-агента |
| [14-identity-matrix-and-product-model.md](14-identity-matrix-and-product-model.md) | Актуальная модель аккаунта, пресетов, команд, заданий, Matrix и нового Dock |

## Неотменяемые требования (tl;dr)

1. **Camera-first, настраиваемый старт**, shutter без звука/вибрации приложения, **нет записи в системную галерею**.
2. **PIN на Gallery/Settings по умолчанию**, camera before PIN; пользователь выбирает PIN before camera / disabled. PIN не должен ложно считаться сильным шифрованием.
3. **Фото делается без ожидания GPS или сервера.** До server-confirmation показать **«Фото ещё не в облаке»**; до получения точного location показать **«GPS уточняется / неточен»**. Закрытие PWA не гарантирует фоновой загрузки и GPS.
4. **E2EE оригиналов, thumbnails, EXIF, GPS, descriptions, edit docs, versions**. Admin не имеет decrypt key; браузерная supply-chain атака — признанный риск.
5. Личный и совместный Vault; upload-only submitter, curator; профили съёмки как правила, не просто категории.
6. **Редактирование после попадания на сервер** через клиентскую расшифровку: текст, рисунки, фигуры, кадрирование, яркость/контраст и прочее, неразрушающие версии.
7. **Сроки:** Free ≤14 дней; дешёвый платный — 3 месяца; дорогие — 12 месяцев и более; пользователь может поставить меньший TTL вплоть до 1 часа. Доступ блокируется при истечении, physical cleanup верифицируется.
8. Anonymous optional pseudonym, no required email/phone, user-held recovery; **криптоплатежи без подписок**, prepaid storage, без вечного бесплатного обещания.
9. **PWA доступна по URL без магазинов**; no mandatory Capacitor, no Ente fork/API/vendor lock-in; гибкая S3-compatible storage abstraction.
10. Не превращать проект в enterprise платформу или тяжёлый стек; не снижать надёжность криптографии, очереди и удаления ради скорости разработки.

## Правила для агента

- Это **спецификация, не roadmap**. Агент самостоятельно создаёт decomposition и PR-план после прочтения всех файлов. Roadmap в _docs по данному заданию не добавлять.
- Функции с неоднозначностью отражены в 13. Агент должен выбрать технический способ и документировать компромиссы, а не молча игнорировать требования.
- Security claims должны быть проверяемы: никакого «100% анонимно», «100% фоновая загрузка iOS», «GPS до шага» или «моментальное физическое уничтожение каждой копии».
- В случае конфликта требований: сохранить E2EE, честность статусов и запрет необъявленных потерь данных; пометить конфликт и решение.
- Для каждого PR: ссылаться на соответствующие требования, покрывать ключевые acceptance из 12, описывать fallback на Safari/iOS, privacy threats и исключения.
- Сначала обеспечить проверяемую архитектуру и совместимость, затем приятный UX. Производительность камеры не должна требовать отключения E2EE.
- Репозиторий создан пустым. Любой код — новая реализация на основании этих документов, не предполагать уже существующие таблицы/сервисы.

## Источники и caveats

Официальные внешние API/стандарты и их ограничения перечислены в соответствующих технических файлах. Стек и конкретные endpoints в 11 — предложения архитектуры, а не утверждение, что такие сервисы уже существуют. Цифры GB, долларовые цены, SLA, конкретный хостинг и криптографический протокол финализируются после инженерной проверки; утверждённые пользователем принципы зафиксированы в 13.

B03 local implementation: [account workspace contract](../contracts/account-workspace-api.md), [ADR 0008](../docs/adr/0008-account-workspace-and-assignment-discussions.md), [usage and validation](../docs/operations/account-workspace.md). Photo E2EE remains B04; requirements above are not a claim that encryption has shipped.
