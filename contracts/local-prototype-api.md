# Temporary local prototype API v1

This explicitly plaintext development API is separate from the proposed E2EE
contracts in `_docs/11-architecture-api-contracts.md`. It is always disabled in
production. Errors use the existing safe `error.code/message_key/request_id/retryable`
envelope; all responses including media are private/no-store.

Prefix: `/api/v1/prototype`. Except library creation, require
`Authorization: Bearer <64 lowercase hex characters>`. No query credentials,
cookies, email/password providers, public storage paths or permanent URLs.

| Method/path | Request | Result |
| --- | --- | --- |
| POST `/libraries` | No body | 201 `{accessCode, libraryId}`; code is returned once |
| GET `/profiles` | — | `{libraryId, profiles: Profile[]}`; includes archived profiles |
| PUT `/profiles/{uuid}` | `{name, description, version, archived, rules}` | `{profile}`; version 0 creates, matching version updates; stale version 409 |
| GET `/photos` | — | `{libraryId, photos: Photo[], deleted: UUID[]}` for this library |
| POST `/photos` | Multipart `manifest` JSON string, `original` file, `thumbnail` file | `{photo}` after both storage writes/HEAD size and DB visibility commit |
| GET `/photos/{uuid}` | — | `{photo}`; pending/unknown 404, deleted 410 |
| GET `/photos/{uuid}/original` or `/thumbnail` | — | Opaque stream, `application/octet-stream`; authorization checked each request |
| PATCH `/photos/{uuid}` | JSON `{title, note, favorite, revision, category?, metadata?}` | `{photo}` with revision +1; stale revision 409; profile restrictions apply |
| DELETE `/photos/{uuid}` | — | 200 `{deletion:"verified"}` or 202 `{deletion:"pending"}`; access immediately revoked |

`Photo`: `id` UUID, `createdAt` epoch milliseconds, `width`, `height`, `bytes`,
`mime`, `method` (`demo`/`image-capture`/`video-frame`), `title` (<=120 chars),
`note` (<=2000 chars), `favorite` boolean, `remoteRevision` positive integer,
`remoteLibraryId` opaque UUID. Upload manifest includes the corresponding capture
and metadata fields; client-only fields are ignored. No server-side image decode.

Original <=64 MiB; thumbnail <=2 MiB. Allowed original MIME labels: JPEG, PNG,
WebP, AVIF, HEIC, HEIF; browser thumbnails are JPEG. An identical retry of the same
UUID/content returns the existing photo/current metadata. Changing immutable
bytes/dimensions/capture fields for an existing UUID returns 409. Tombstones
return 410 even if deletion arrived before the first upload. New library upload
IDs are independent of other libraries. Unknown deletion is idempotent without
revealing another library's data.

Reservations count against configurable bytes/count limits under a library row
lock. S3 failure returns retryable 503, never an active row. Pending reservations
expire after one hour; deleted objects retry via the scheduler. Metadata, hashes,
and bytes are plaintext in this prototype; no final retention, recovery, E2EE,
sharing or device authorization acceptance is claimed.

## Profile capture extension

Profiles and their append-only rule snapshots belong to one library. At most 100
profiles per library; every save increments the version. Archiving changes future
capture selection and never deletes photos. The rules schema is defined by
`App\Prototype\ProfileRules`: dimensions/aspect/fit/quality, embedded metadata
selection, location/accuracy/active window, required description/category,
categories/shot list, completed-field edit permission, and short-ID prefix.
Conflicting dimensions or metadata choices return 422.

Upload manifests may add `profile: {id, version}`, `shortId`, `category`, `shot`,
and `metadata` (manifest maximum 40000 characters). The server resolves the
owned historical profile snapshot itself; client-supplied permissions are never
trusted. Profile/version, short ID and shot bind the upload fingerprint.
Short IDs are unique per library. Category is mutable metadata and does not change
upload identity. Earlier photos without profiles remain readable.

`metadata` allows only `capturedAt`, `camera`, `locationStatus`,
`resolutionLimited`, and `location: {latitude,longitude,accuracy,measuredAt}`.
Unselected fields are rejected. Completed title/note/category changes return 403
when forbidden; empty values may be completed once. Location sidecars may be
updated independently, with revision conflict protection; capture date, camera
information and the resolution-mismatch flag cannot be rewritten through PATCH.
The API does not decode images or claim to verify the truth of client GPS or
pixel content. New local profile captures bind to their library before upload.
