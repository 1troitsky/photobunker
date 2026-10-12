# PhotoBunker client

Vue 3, TypeScript and Vue Router run as a standalone SPA. The repository root
contains the supported OrbStack/Compose setup; `API_PROXY_TARGET` points Vite at
Laravel for native development. All assets are local and no camera, GPS or
account permission is requested by this foundation.

```sh
npm ci
npm run dev
npm run check
```

`npm run check` runs behavior tests, TypeScript validation and the production
build. Node 22.12+ or 24+ is required. Install dependencies on the platform where
they will run; a macOS `node_modules` directory cannot be reused in Linux.

## Offline shell

`npm run build` writes `dist/sw.js` and the manifest/icons. The production client
registers the worker on HTTPS or localhost. Vite development does not register a
worker; use `npm run preview` to verify a production build locally.

The worker precaches a generated, exact list of public JS/CSS, icons, manifest
and HTML. Only `/`, `/camera`, `/gallery` and `/settings` can use the offline HTML
fallback. API calls, storage URLs, user media, query strings and other origins
are never intercepted or cached. There is no background sync, photo queue or
cryptographic storage in this stage. A worker update waits for existing clients
to close; it does not force an active session onto a new build.

The behavior tests cover camera unavailability without media permission,
navigation, RU/EN and denied preference storage, connectivity messaging and the
service worker cache boundary. Real iOS Home Screen and Android installed-PWA
checks are still pending; a desktop build is not evidence of device support.
