# ADR 0005 — browser probes до реализации capture/outbox

Статус: принято для изолированного стенда I02; product/device readiness остаётся pending. Дата: 12 октября 2026.
Основание: [_docs/04](../../_docs/04-camera-capture-and-sync.md), [_docs/12.C/D/F/K](../../_docs/12-quality-acceptance-and-operations.md).

## Проблема и варианты

Успешная сборка Vue не подтверждает поддержку camera still-photo, атомарного Blob commit или WASM под CSP. Варианты: сразу писать production queue с assumed support; опираться только на browser support tables; измерить primitive APIs на изолированном стенде и повторить на устройствах. Выбран третий вариант.

`tools/browser-spike` — отдельный Node/Vite package, origin/port и IDB database, без imports из product runtime, API calls, env/credentials, SW или product routes. Доступ к камере только по отдельному click; автоматические tests используют random bytes, generated canvas и fake Chromium camera. Временные фотографии/preview не записываются на диск намеренно и не входят в JSON отчёт. Освобождение browser/OS memory не гарантируется.

## Решения и fallback

Outbox candidate — IndexedDB, ciphertext Blob/chunks и encrypted job payload в одной readwrite transaction. `put.onsuccess` недостаточен: local commit только после `transaction.complete`. Запрашивается `durability: strict`, фактически полученная durability записывается в отчёт; если option не поддерживается, измеряется обычная transaction без ложного утверждения strict. Это не гарантия power-loss survival/eviction. Основание: [IndexedDB transaction API](https://w3c.github.io/IndexedDB/#dom-idbdatabase-transaction).

В I05 encryption/hashing выполняются до transaction; внутри неё не ждут network/worker/crypto tasks, иначе browser может auto-commit. Readback проверяет Blob/job вместе; request-success → explicit abort должен оставить оба отсутствующими. Spike также закрывает и заново запускает настоящий desktop browser process с тем же profile. Abrupt kill mid-write, disk-full, 20 кадров и eviction — отдельные обязательные device tests, не эквивалент clean restart.

При неприемлемом IDB Blob behavior fallback — OPFS write→verify→IDB commit marker и cleanup incomplete objects, после отдельного spike. При полном/недоступном storage — save failure, а не успешный memory-only capture. CacheStorage/localStorage не используются для фото; service worker остаётся public shell cache. `persist()` только явным действием и с честным результатом отказа; первоначальный storage estimate не является обещанием свободного места.

Локальный spike выявил `UnknownError` при Blob commit в ephemeral WebKit 27.2 на macOS arm64. Оба records отсутствуют, ошибка остаётся видимой; в постоянном profile того же engine полный suite/process restart проходит. Это основание проверять реальную transaction до обещания локального сохранения, не определять поддержку по наличию IndexedDB. Полные версии и ограничения — в [матрице](../operations/browser-compatibility.md).

Capture candidate — getUserMedia video track + feature-detected ImageCapture.takePhoto; Canvas fallback берёт фактические videoWidth/videoHeight, без искусственного общего лимита FullHD. Результаты still/video, EXIF orientation, forced platform sound и front/back сравниваются на физическом test card. [Image Capture specification](https://w3c.github.io/mediacapture-image/) задаёт API, но не качество конкретного устройства. Generated canvas и fake camera не доказывают ориентацию/разрешение iPhone.

Libsodium `libsodium-wrappers@0.8.4` закреплён только в lab lockfile. Worker проверяет готовые secretstream/sealed-box APIs на 8 MiB в 1 MiB chunks; приложение не получает codec/recovery implementation этим PR. Worker bundle измеряется build output; WASM compile + sodium.ready под CSP проверяются отдельно. Policy разрешает `wasm-unsafe-eval`, без `unsafe-eval`; negative HTML entry запрещает WASM и должен дать compile failure. Product gateway CSP не ослабляется. Перед I03 выбирается узкая release worker policy и контролируется bundle size. [CSP script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).

Non-extractable P-256 key candidate хранится через structured clone в IDB; sign/verify после reload/process restart и отказ raw export — обязательная совместимость. Это upload-auth key, не хранилище read secrets и не доказательство OS hardware protection. Unsupported storage означает повторную upload authorization после reload, не raw private-key fallback. [WebCrypto ECDSA](https://w3c.github.io/webcrypto/#ecdsa).

Memory measurements не подменяются `navigator.deviceMemory` или размером ciphertext. Стенд фиксирует elapsed/chunk/encoded bytes; реальный peak RAM, image decoding, worker cancellation, rapid captures и mobile pressure измеряются отдельно через browser/device tools. Headless desktop timing не является shutter latency target.

## Lifecycle и границы доверия

Стенд выключает camera tracks и worker на hidden/pagehide. Видимость и online/offline events в локальном отчёте — наблюдения текущей вкладки, не доказательство background upload. Отчёт скачивается явно, содержит UA, capability booleans, dimensions/timing/status; без media bytes, IDs/labels камеры, location, ключей и сетевых адресов. Нет автоматической аналитики/отправки отчёта.

Matrix и ручной протокол: [browser-compatibility.md](../operations/browser-compatibility.md). Playwright Chromium/Firefox/WebKit — desktop engines; WebKit не заменяет iPhone Safari/Home Screen, fake camera не заменяет Android still pipeline. I02 поставляет ADR и runnable probes; review протокола и физические device gates остаются открытыми до фактических результатов.
