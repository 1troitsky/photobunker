# B02: переписка и восстановление истории

Локальная интеграция от 15 октября 2026. [Архитектура](../adr/0007-matrix-messaging-and-recovery.md), [Identity API](../../contracts/identity-api.md), [запуск Matrix](identity-matrix-local.md). Фото, Vault и права команд ещё относятся к B03/B04; звонки — B06. Production guard сохранён. Физические iPhone/Android и независимый security review остаются перед выпуском.

## Как пользоваться

1. Создать аккаунт и сохранить один ключ аккаунта. Открыть «Сообщения»: SDK автоматически настраивает signing/SSSS/backup. Private SDK secrets сохраняются под ключом аккаунта до публикации публичной identity.
2. Плюс → ID/@username → «Написать», либо «Контакты → поиск → Написать». Получатель автоматически получает переписку без принятия приглашения. Группа создаётся с названием и выбором участников.
3. После обычного перезапуска вход остаётся подключённым. После явного выхода требуется единственный ключ аккаунта; фото и переписка восстанавливаются автоматически.
4. Проверка собеседника по эмодзи — проверка личности, не ещё один ключ восстановления. Старую копию импортируют только при переносе прежних данных, если secrets утрачены на доступных устройствах. [Актуальные ограничения](single-account-key.md).

Тексты и ответы шифрует Matrix SDK. Статусы различают локальную отправку/ошибку, приём сервером и настоящее уведомление о прочтении. Приём сервером не объявляется доставкой другому устройству. Невернувшаяся отправка имеет явный повтор. Название комнаты, участники, время, сетевые размеры и read receipts являются метаданными, видимыми серверу; название не следует использовать для секретных сведений.

## Один пользовательский ключ

Пользовательский ключ аккаунта восстанавливает аккаунт, фото и Matrix через подписанный encrypted recovery package. Внутренние SDK signing/backup/session keys не показываются в штатном UI. Сервер хранит ciphertext и публичные identity bindings. Старые PB4/history keys допускаются для однократного импорта прежних данных; они не пересоздаются при сбое. [ADR 0014](../adr/0014-single-account-key.md).

## Хранение и жизненный цикл

matrix-js-sdk **44.0.0**, Rust/WASM bindings **18.9.0** закреплены lockfile. Один Web Lock удерживается на account/device всё время инициализации и работы SDK; вторая вкладка показывает предложение использовать первую. Без Web Locks переписка явно недоступна. При уходе из раздела, выходе, смене аккаунта или pagehide SDK останавливается; lock освобождается после завершения cleanup. Потеря уже инициализированной crypto DB не приводит к молчаливому созданию новых ключей под прежним устройством: требуется подключить новое через recovery.

Rust store в IndexedDB шифруется случайным 256-bit ключом. Ключ хранится в отдельной IDB как AES-GCM envelope с non-extractable browser CryptoKey и AAD, связанным с account/Matrix device. Это не PIN/strong unlock, не защита от XSS или заражённой ОС. PIN и защита локальных фотографий — B04. Токены, расшифрованная лента и черновик сообщения находятся в памяти; plaintext-история не записывается SDK в постоянное хранилище.

Reload онлайн сохраняет способность расшифровки через Rust store и снова загружает события Matrix. При разрыве сети открытый черновик остаётся, отправка недоступна, после восстановления связи можно продолжить. Холодное открытие истории offline и фоновая отправка не заявлены. Service worker не кеширует API/Matrix; WASM не входит в текущий precache. На скрытой странице тексты убираются из DOM и read receipt не отправляется. OS push с содержимым сообщения не реализован.

Блокировки объединяют PhotoBunker policy и Matrix ignore list; проверяются перед отправкой и раз в 15 секунд в видимом активном разделе. Чат с заблокированным участником не разрешает отправку; заблокированные входящие приглашения не присоединяются автоматически. Разблокировка не восстанавливает снятое отношение контакта. Блокировка не стирает прежние ciphertext/полученные ключи и не отзывает фото-права. Выход из комнаты — явное действие. Membership Matrix не выдаёт grant фотографий; оригиналы не загружаются в Matrix media.

## Проверка

При уже запущенном локальном Matrix:

```sh
./scripts/dev check
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/photobunker-playwright-browsers node tools/browser-spike/check-profile-save.mjs
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/photobunker-playwright-browsers node tools/browser-spike/check-messages.mjs
```

Linux/CI использует `/tmp/photobunker-playwright-browsers`. `MESSAGE_BROWSERS=chromium` или `webkit` выбирает один engine. QA создаёт синтетические аккаунты, держит ключи/тексты только в памяти, не снимает скриншоты секретов. Cleanup деактивирует лишь точные fixtures с проверенным root fingerprint. Внешних Matrix-серверов и CDN в сценарии нет.

Проверяется обмен между тремя аккаунтами: личный чат, ответ, read receipt, SAS, группа; ciphertext в реальных send payloads и серверном событии; cross-signing/backup; один владелец IDB; reload; offline/reconnect; новый verified device с правильным backup key и отказом неверному; отзыв активного устройства; обычный выход/вход; blocked room/send denial; отмена восстановления при смене аккаунта; ширины 320/390/768/1440 px. Компонентные проверки формы отдельно проверяют ошибки и сохранность черновика.

Измерение локальной production-сборки: WASM около 7.8 MB raw / 2.1 MB gzip, SDK chunk около 816 KB raw / 224 KB gzip; загрузка лениво при открытии сообщений. Предупреждение Vite о chunk >500 KB остаётся известным ограничением; это не измерение быстродействия на телефоне. Автоматические браузеры проверяют localhost HTTP с доверенным loopback secure context. Доступ к `https://photobunker.orb.local` в данном QA окружении не установлен, проверка HTTPS и настоящих мобильных устройств остаётся отдельной.


Результат 15 октября: полный `./scripts/dev check` прошёл (56 API tests / 649 assertions, Pint 67 files, storage-check, 74 client tests, TypeScript/build). `check-messages.mjs` и `check-profile-save.mjs` прошли в Chromium и WebKit. Прежние `check-ui-workspace.mjs` и `check-account.mjs` также прошли на обоих engines; account QA выполнялся с `IDENTITY_DRILLS=0`, без повторения B01 outage/cold volume-copy. Локальный Matrix после QA подтвердил readiness. Проверки не являются production security audit или проверкой настоящего мобильного железа.

## B03 regression note (2026-10-15)

Workspace photo polling is independent of Matrix crypto. WebKit can emit a native `Fetch API cannot load` diagnostic for a cancelled `/identity/workspace/photos` request during full-document account recovery/navigation. A minimal recovery probe confirmed cancelled requests, while separate `window.error` and `unhandledrejection` monitoring remained empty. Messaging QA reports these exact native photo-poll diagnostics separately; all JavaScript errors/rejections, other browser errors, unexpected network origins and encryption/history assertions remain strict. B03 workspace QA separately verifies actual successful photo requests and account isolation in both engines. API requests stop on pagehide, refuse new work from inactive documents and resume on pageshow.

Final B03 regression: Chromium and WebKit messaging scenarios passed with the monitoring above; no JavaScript runtime errors or unhandled rejections. WebKit reported two native cancelled-photo-poll diagnostics in the final messaging run.


B04 integration: assignment entry waits for both `m.room.encryption` (Megolm) and Rust crypto's room-enabled confirmation after joining. These can arrive separately; the composer remains unavailable while syncing and the existing retry remains available. An unsupported algorithm fails closed. Photo references now accept encrypted photo IDs after strong unlock/current share grant/original-envelope verification; the message still contains only an ID, no media/DEKs. Browser coverage lives in `check-photo-workspace.mjs`.

Пользовательский экран переработан 16 октября 2026: [новая навигация и границы UI](../product/messenger-ux.md). Превью, черновики текущего раздела и кеш доступных имён остаются в памяти; дополнительных plaintext stores нет.
