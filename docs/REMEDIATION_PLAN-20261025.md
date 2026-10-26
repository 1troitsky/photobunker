# PhotoBunker — архив remediation 25–26 октября 2026

Этот файл больше не является планом или очередью задач. Операционный backlog перенесён в [GitHub Issues](https://github.com/1troitsky/photobunker/issues), стадии — в [Project PhotoBunker Development](https://github.com/users/1troitsky/projects/1), продуктовый roadmap — в [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

Новые карточки, статусы и критерии сюда не добавляются. Исторические подробности остаются в PR и их review.

## Интегрированный переход

| Task | Результат | PR |
| --- | --- | --- |
| R0-01 | Account onboarding и повтор частичной регистрации | #17 |
| R0-02 | Session bootstrap, recovery, deep links и изоляция аккаунтов | #18 |
| R0-03 | Базовая E2EE-переписка, durable outbox и мобильный composer | #19 |
| R1-10 | Welcome page и favicon/PWA assets | #20 |
| R1-01 | Жизненный цикл геолокации камеры | #21 |
| R1-04 | Профиль Team | #22 |
| R1-02 | Постоянный NAME-ID и offline-резерв фотографий | #23 |
| R1-03A | Приватная Photo Card | #24 |
| R1-03B | Card-only публикация, metadata opt-in, TTL/revoke | #25 |
| R1-03C | Независимые safe-photo/original/download scopes | #26 |

Все строки означают `Integrated`, а не `Accepted`: владелец проведёт общую mobile-приёмку после удалённого развёртывания.

## Последняя локальная интеграция

PR #26 слит 26 октября merge-коммитом `a0de0feb0ee02351aac983a13d265ae3b839ab1a`; проверенный fix-head — `a5a5779c5271b276672623fad9e6ac916e878782`.

Codex дополнительно исправил типизацию Blob, cleanup всех связанных ciphertext objects, каскадное удаление, canonical AAD с NUL-разделителем и сохранение MIME/расширения original. Локально прошли typecheck, production build, целевые Vitest, полный `EncryptedPhotosTest`, Pint, миграция, Chromium pixel-test privacy masks и card-only/retry/revoke/image-scope browser flow. Физические устройства остаются для `Accepted`.

## Действующий процесс

Роли, Definition of Ready/Integrated/Accepted, WIP и передача работы описаны в [COLLABORATION.md](../COLLABORATION.md). Следующая задача создаётся как GitHub Issue из roadmap/CHECKLIST; владелец передаёт Chatbot Agent только её ссылку и напоминание прочитать `CHATBOT-AGENTS.md`.
