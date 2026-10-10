# Camera, Quick Capture & Sync Contract
Статус: обязательная поведенческая спецификация.

## 1. Ключевой пользовательский цикл
Установленная PWA → камера на старте по умолчанию → один tap затвора → файл захвачен → сразу начать **локальную durable encrypted фиксацию** и подготовку отправки → следующий снимок разрешён без ожидания GPS, thumbnail, обработки предыдущего, ответа сервера. Когда сервер подтверждает integrity/commit, UI переходит в cloud-confirmed. Пользователь вправе закрыть приложение, но **пока нет server commit, кадр существует только в локальной зашифрованной очереди**. Это должно быть показано честно.

## 2. Получение изображения
- Базовый путь через getUserMedia + MediaStreamTrack; feature-detect ImageCapture.takePhoto() там, где реально поддерживается и даёт более качественный still; fall back к видеокадру/Canvas с корректной ориентацией и предупреждением о потенциально меньшем разрешении. Не использовать системный Gallery/Photos API для записи.
- Не использовать файловый input capture, если реализация не может гарантировать отсутствие добавления в системную галерею. Import from Gallery допускается только как отдельная явная команда пользователя, которая НЕ удаляет исходник в галерее.
- Возможности камеры определяются capabilities: front/back, supported resolutions, focus/exposure/torch только по supports. Не имитировать доступ к HDR/RAW/стабилизации/линзам без поддержки.
- Shutter no application sound, no default vibration. Принудительный системный звук в некоторых регионах и системный privacy camera indicator не обходить.
- Получить точный client capture timestamp (wall-clock ISO и monotonic offset для относительного времени), timezone и device-side sequence; клиентские часы могут быть неверными, сервер фиксирует received_at отдельно.
- Первоначальное описание/категория по профилю можно добавить позже; capture must never block on them.
- Camera track отключается по Quick Exit/background, кроме необходимости подготовленной операции в пределах разрешённого браузером foreground lifecycle.

## 3. Capture state machine
Состояния одного кадра:
1. CAPTURE_REQUESTED
2. CAPTURED_IN_MEMORY
3. ENCRYPTING
4. LOCAL_COMMITTED (ciphertext и job manifest атомарно сохранены на устройстве)
5. UPLOAD_PREPARING
6. UPLOADING (progress optional)
7. SERVER_VERIFYING
8. CLOUD_CONFIRMED
Дополнительные независимые: RETRY_WAIT, ACTION_REQUIRED, EXPIRED, DELETING, LOST_LOCAL (реальное отсутствие локальной записи). После падения браузера job восстанавливается по идентификатору. Server-confirmation must be based on finalized manifest + verified object existence/size/hash, not an HTTP request started.

## 4. Локальная очередь
IndexedDB/OPFS после capability checks, только ciphertext, зашифрованный job payload и минимальные незашифрованные технические поля. Избегать декодированных фотографий в service worker cache, CacheStorage, logs, IndexedDB или URLs. Не хранить Blob plaintext на диске намеренно. Ключ шифрования захвата доступен до PIN через публичный ключ Vault; recipient/asset private keys недоступны до сильной авторизации. При 0 свободного пространства/отказе storage API блокировать misleading success и показать ошибку.
- atomic transaction for job metadata and encrypted payload; проверить реально ли возможно атомарно зафиксировать Blob+manifest выбранным API; при невозможности implement write-verify-commit + cleanup.
- После CLOUD_CONFIRMED и проверки server object/delete-resume удалять локальный ciphertext и transient jobs, кроме явного offline archive opt-in.
- navigator.storage.persist() просить там, где поддерживается, но даже persistent не гарантирует бессмертие очереди.
- Background Sync только optional optimization, НЕ критическое требование; iOS Safari не обеспечивает надёжный upload после закрытия.
- FIFO with priority for current captures; bounded concurrency; network retries with jitter; resumable multipart/chunk uploads where needed; idempotency and cancellation. При истечении локального TTL очищать job, даже если сеть отсутствует; не оживлять expired photo.
- CORS/pre-signed URLs короткоживущие; S3 object key randomized, HTTP response проверяется, resume may require new signed credentials.

## 5. Взаимосвязь с PIN
Capture-only session может делать фото, потому что зашифровывает на публичный ключ Vault, но не может читать архив. Действия change Vault/profile, если они раскрывают приватные названия или историю, требуют авторизации; допускается pre-authorized alias с нейтральным названием и cryptographically scoped uploader. Нельзя позволять неавторизованному capture UI получить ключи чтения. Vault public-key rotation должны обновлять capture-only envelope безопасно.

## 6. Состояния UI
| Состояние | Индикатор камеры / предупреждение |
|---|---|
| Данные захвачены, local commit ещё не завершён | «Сохраняем снимок… Не закрывайте приложение» |
| Local commit успешен, нет cloud commit | «Фото ещё не в облаке; защищённая очередь на устройстве» (явно, особенно при Quick Exit) |
| Offline | «Нет соединения. N фото ожидают отправки» |
| Upload failed | «Не удалось отправить. Повторим при следующем подключении» + manual retry |
| Server verified | «В облаке» без преувеличений |
| GPS pending | отдельное «GPS уточняется» + предупреждение о выходе |
| Low accuracy | «Местоположение неточно: ±N м» |
| Quota/TTL exceeded | «Недостаточно места/период истёк; снимок не отправлен» |
Никакого success tick, пока asset нет в доступном Vault и подтверждён storage. Counts should not leak thumbnails on lock.

## 7. Quick Exit
Action: immediately obscure viewfinder/archive, stop media tracks, clear decrypted memory reference, mask last view. If unsynced, warning remains accessible via neutral indicator/text; optional discreet visual presentation (without thumbnails, no notification exposing names). Не обещать программное закрытие ОС, продолжение GPS или upload после ухода в фон. Перед обычным выходом при pending upload/geo показать раздельные предупреждения, но **не блокировать выход** и не раскрывать приватное содержание.

## 8. Сбои и контроль
Tests: offline immediately before shutter; loss of network at first chunk/finalize; kill browser between local store/write; out-of-disk; deny camera; rapid burst 20 photos; browser reload while upload; expired URL; deduped finalize; quota downgrade; timezone/clock jumps; expired asset racing finalize; lock during encryption; Safari PWA eviction. Никакой фотоуспех не должен зависеть от GPS.
