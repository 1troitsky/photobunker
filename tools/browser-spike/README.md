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
