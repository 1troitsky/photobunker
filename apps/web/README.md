# PhotoBunker client

Vue 3, TypeScript and Vue Router form a standalone SPA. Use the repository's
OrbStack/Compose environment for the supported local app at
[localhost:8080](http://localhost:8080). The first working prototype stores photos
in this browser without encryption and never uploads them. Accounts, PIN,
server delivery, retention and encryption remain future work.

Click **Try without a camera**, the shutter, then **Gallery**. Real camera access
is requested only by **Turn on camera**. A synthetic demo scene needs no camera
permission. The gallery supports originals, titles/notes, favorites, search,
download and deletion. Settings can clear the entire prototype library.

```sh
# From the repository root; app dependencies run in the Linux container.
./scripts/dev web npm run check
```

For native development, use Node 22.12+ or 24+, `npm ci` and `npm run dev`.
`API_PROXY_TARGET` points Vite at Laravel. Install dependencies on the platform
where they run; macOS and Linux cannot share a `node_modules` installation.

## Prototype boundary

Development enables local capture. Production builds disable it unless built
with `VITE_LOCAL_PROTOTYPE=true`. This explicit flag is for local prototype
preview, not approval to release an unencrypted PhotoBunker. Default release
builds refuse to open the plaintext database.

The dedicated IndexedDB database `photobunker-local-prototype-v1` is separate
from any future encrypted queue. Originals, thumbnails and metadata commit or
abort together. Success is shown after transaction completion. A storage failure
retains the capture in memory for retry or explicit discard, and guards leaving
the page. Deletion/clear are atomic across the same three stores. Metadata edits
never replace original bytes. Clearing browser data can remove the library;
there is no backup or silent migration to future E2EE storage.

Native `ImageCapture.takePhoto()` is preferred when available; unsupported
still capture falls back to a frame at the actual video dimensions. Details show
its source and resolution. Tracks stop on navigation, background and page hide,
including permission results that arrive after cancellation. Real iOS camera
quality, orientation, memory limits and installed-PWA behavior remain unverified.

## Offline shell

`npm run build` writes `dist/sw.js` and the manifest/icons. Production registers
the worker on HTTPS or localhost; Vite development does not install it. To test
a local production preview, explicitly build with `VITE_LOCAL_PROTOTYPE=true`,
then run `npm run preview` and visit it online once before going offline.

Only the generated public asset list is precached. `/`, `/camera`, `/gallery`,
`/settings` and `/gallery/<uuid>` can fall back to public HTML. Photos stay in
IndexedDB; API calls, storage URLs, user media, query strings and other origins
are never cached. No background upload is implemented. Updates wait for existing
clients to close and do not force a new build into an active session.

## Checks

`npm run check` runs 14 component/lifecycle/cache/release-guard tests, TypeScript
validation and the production build. Actual Blob storage, process restart,
original-byte integrity, download and failure rollback are checked by the
repeatable browser script described in
[the local prototype runbook](../../docs/operations/local-prototype.md).
