# PhotoBunker I02 browser lab

Изолированный developer tool для проверки browser APIs до продуктовых crypto/capture/outbox. Не импортируется `apps/web`, не имеет API/env/ключей приложения, не реализует ADR 0002 wire format. Automatic probes не запрашивают камеру/GPS. Browser report содержит только capabilities, безопасные codes и технические размеры/время.

На host нужен уже используемый Node.js 22. Установки этого отдельного package выполняются на host; не используйте Linux `apps/web/node_modules` для Mac.

```sh
cd tools/browser-spike
npm ci --ignore-scripts --no-fund
npm run dev
```

Открыть http://localhost:5180. `Запустить пробы` проверяет libsodium worker/CSP, синтетический 4 MiB IDB Blob/job commit/abort, P-256 CryptoKey persistence и generated canvas. `Проверить после reload` выполняет readback/hash/signature verification, а не новую запись. `Очистить данные стенда` удаляет только `photobunker-i02-synthetic-lab` database этого origin. В product outbox стенд не обращается.

Production build с проверяемой CSP:

```sh
npm run check
npm run preview
```

Dev/preview используют один port 5180 и запускаются по отдельности. `blocked.html` — negative WASM/CSP entry, обычные пробы там должны завершаться отказом. Сервис-воркера нет: этот lab не обещает offline reload или background upload.

Для воспроизводимых desktop tests:

```sh
export PLAYWRIGHT_BROWSERS_PATH=/private/tmp/photobunker-playwright-browsers
npx playwright install chromium firefox webkit
npm test
```

На Linux установка browser system dependencies: `npx playwright install --with-deps chromium firefox webkit`. Браузеры/пакеты требуют первоначального скачивания; подготовленные tests не требуют внешних runtime services. `npm test` сам собирает/запускает preview и останавливает свой server. Свободный port 5180 обязателен. Видео/traces/screenshots отключены; временные browser profiles удаляются после теста. Бинарники в `/private/tmp` могут быть удалены системой и потребовать повторного install; другой каталог можно задать env переменной.

Fake camera test запускается только в Chromium. Для физических тестов используйте неперсональную test card, явно включите камеру, измерьте still/Canvas в обеих ориентациях, затем выключите. Снимки не сохраняются/не отправляются; browser/OS temporary memory вне контроля стенда. Телефону нужны собственные LAN/DNS и trusted HTTPS; `localhost` указывает на телефон. Не обходите certificate warning и не включайте insecure-origin camera flags для доказательства поддержки.

Полная матрица, команды и pending checks: [browser compatibility runbook](../../docs/operations/browser-compatibility.md).

## iPhone по локальному HTTPS

Mac и iPhone должны быть доступны друг другу в одной локальной сети. На Mac нужен OpenSSL; облачный tunnel, внешний storage и изменение доверия в macOS не требуются.

```sh
cd tools/browser-spike
npm run device:setup
npm run device
```

Setup выбирает единственный private IPv4 физического интерфейса. При нескольких адресах укажите нужный явно: `npm run device:setup -- --ip 192.168.1.20` (это пример, нужен реальный адрес Mac). Создаются local CA на 90 дней и server certificate на 30 дней, RSA-3072/SHA-256 с IP SAN и serverAuth. Ключи имеют mode 0600 в игнорируемой `.local/browser-spike/tls`; CA при повторном setup сохраняется. Команда `device` собирает только lab и открывает HTTPS на выбранном IP:5443. Порт 5181 выдаёт исключительно публичный CA `.cer`; остальные пути — 404. Ни API приложения, ни исходники/env этим сервером не публикуются.

1. Передайте **публичный** `photobunker-lab-ca.cer` с Mac на iPhone через AirDrop либо откройте напечатанный HTTP download URL в доверенной локальной сети. Имя CA и SHA-256 напечатаны в терминале; приватные `.key` не передаются.
2. Установите загруженный certificate profile в настройках iPhone. Затем **Настройки → Основные → Об этом устройстве → Доверие сертификатам**: включите полное доверие именно этому PhotoBunker Local Lab CA. Установка профиля сама по себе не включает SSL trust. [Инструкция Apple](https://support.apple.com/en-us/102390).
3. Откройте напечатанный **HTTPS** URL в обычной Safari tab без обхода certificate warning. В отчёте должны быть `secureContext: true` и доступный WebCrypto. Нажмите «Запустить пробы», reload, затем «Проверить после reload». Ошибка считается результатом проверки, не успешным сохранением.
4. В Safari: Поделиться → На экран «Домой»; если доступен переключатель «Открывать как веб-приложение», включите его. Откройте иконку и проверьте `standalone: true`. В этом режиме отдельно повторите probes, reload/reopen, test-card камеру и уход в background. Не предполагается, что storage Safari tab и установленного приложения обязательно общий. [Инструкция Apple](https://support.apple.com/en-euro/guide/iphone/iph42ab2f3a7/ios).
5. Запишите модель/iOS, tab или installed mode и результат; JSON скачивается только явным действием. Непроверенные physical camera/queue сценарии остаются pending. Для удаления тестового доверия удалите этот certificate profile в настройках iPhone после завершения device tests.

Порты 5443/5181 также доступны на `127.0.0.1` для отдельной проверки на Mac, без bind на `0.0.0.0`. Доверие macOS не меняется; CLI может использовать `curl --cacert ../../.local/browser-spike/tls/ca.pem https://127.0.0.1:5443/` из package directory. Успех loopback не доказывает доступность с телефона.

Ctrl+C останавливает все слушатели. При смене IP повторите `device:setup` и `device`; CA сохранится, повторное доверие к тому же CA не требуется. Если CA истекает/повреждён, setup останавливается: сначала удалите старый профиль на iPhone, затем осознанно замените `.local/browser-spike/tls`. Старый IP — другой origin, автоматического переноса lab database между адресами нет. Если телефон не видит Mac, проверить общую сеть, guest isolation и разрешение входящего соединения Node в macOS; tunnel или отключение TLS checks не подменяют эту проверку.
