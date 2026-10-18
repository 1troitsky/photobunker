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
| POST `/clock` | — | `{id, issuedAt}`; library-scoped server anchor, epoch milliseconds |
| GET `/profiles` | — | `{libraryId, profiles: Profile[]}`; includes archived profiles |
| PUT `/profiles/{uuid}` | `{name, description, version, archived, rules}` | `{profile}`; version 0 creates, matching version updates; stale version 409 |
| GET `/photos` | — | `{libraryId, photos: Photo[], deleted: UUID[]}` for this library |
| POST `/photos` | Multipart `manifest` JSON string, `original` file, `thumbnail` file | `{photo}` after both storage writes/HEAD size and DB visibility commit |
| GET `/photos/{uuid}` | — | `{photo}`; pending/unknown 404, deleted 410 |
| GET `/photos/{uuid}/original` or `/thumbnail` | — | Opaque stream, `application/octet-stream`; authorization checked each request |
| PATCH `/photos/{uuid}` | JSON `{title, note, favorite, revision, category?, tags?, metadata?, expiresAt?}` | `{photo}` with revision +1; stale revision 409; profile restrictions apply |
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
and bytes are plaintext in this prototype; no production retention, recovery, E2EE,
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

## Delivery, tags and retention extension

`rules.retentionSeconds` is optional for compatibility with saved historical
profiles; new client profiles choose 3600–1209600 seconds. Uploads using such a
profile must include `retentionSeconds` and `retentionAnchor`; their duration
cannot exceed the historical profile's duration. `expiresAt` may further shorten
it. The server deadline is the minimum of capture time + duration, original
anchor issuance + duration and an explicit deadline. Missing/foreign anchors
return 422; already expired uploads return 410 before creating objects.
Old uploads without a retention policy keep their existing behavior.

### Standard capture before a library exists (U01)

The UI no longer requires a saved profile. A standard private capture records
the original local deadline, default metadata and an upload intent immediately,
even on the very first offline launch. Its local-only `initialCapture` marker
allows the queue to create/connect a prototype library and obtain its **first**
server anchor when connectivity returns. Binding is atomic, performed once,
and uses `min(original local deadline, anchor deadline)`; it never restarts TTL.
The upload still supplies a valid library-scoped anchor to the unchanged API.

This exception applies only to explicitly marked, unanchored private captures
without a profile, space or assignment, and never to another library's rows.
Existing anchored captures never replace their anchor. Missing anchors on old
or shared captures remain an action-required clock error. Client capture time
before first server contact is unverified; this is a local prototype behavior,
not the final encrypted account/clock protocol. Expired initial captures are
removed locally and never delivered. Legacy local photos without a new upload
intent are not adopted automatically.

`Photo` adds optional `expiresAt`, `retentionSeconds`, `retentionAnchor` and
`tags: string[]` (at most 20 distinct nonempty strings, each at most 40 chars).
Tags are mutable sidecar data, subject to the profile's completed-field lock.
They are removed during verified deletion. PATCH can only shorten an existing
deadline; adding a deadline to a legacy photo is bounded by 14 days from now.
Expired IDs appear in `deleted` even before the cleanup scheduler runs. GET,
content, PATCH and repeated upload deny access with 410 at expiry.

The current uploader also supplies optional lowercase SHA-256 `originalChecksum`
and `thumbnailChecksum` in the manifest. Mismatch returns retryable 503 before
reserving an ID or writing storage. Both checksums and the upload fingerprint
are plaintext development transport checks, unrelated to the future E2EE format.
Original bytes, capture identity, profile snapshot identity and original
anchor/duration remain bound to the idempotency fingerprint. Mutable metadata
and a shorter deadline do not create a second photo.

Cleanup retries failed deletions with exponential backoff, verifies both keys
are absent and scrubs personal metadata. Verified tombstones remain to prevent
re-upload. Server backups and future versions/shares are outside this prototype's
acceptance. See [the stage 2 runbook](../docs/operations/delivery-retention-prototype.md).

## Collaboration extension

Each existing anonymous library is also an actor identity. A profile can create
a shared `spaceId` owned by that actor. Sharing creates a new profile version;
historical private snapshots/photos remain private. Members authenticate with
their own library tokens. Shared uploads reserve the owner's storage quota;
clock anchors remain bound to the capturing actor. `remoteLibraryId` in a
response identifies the requesting actor's connection, not physical ownership.

| Method/path | Request | Result |
| --- | --- | --- |
| POST `/profiles/{id}/space` | `{version}` | `{profile}`; owner only, new shared snapshot |
| GET `/spaces/{id}` | — | `{space,members,invitations}`; invite verifiers/secrets omitted |
| POST `/spaces/{id}/invitations` | `{role,readOwnPhotos,manageProfiles,duration}` | 201 `{id,code,expiresAt}`; owner only, one recipient, duration 300–604800 seconds |
| POST `/invitations/accept` | `{code,nickname}` | `{spaceId}`; authenticated recipient, replay safe for the same active recipient |
| DELETE `/invitations/{id}` | — | Revokes invitation and membership accepted through it |
| PATCH `/spaces/{id}/members/{member}` | `{active,readOwnPhotos,manageProfiles}` | Owner changes flags or revokes; reactivation needs a new invitation |
| GET `/assignments` | — | `{assignments}`; contributors see assigned tasks only |
| POST `/assignments` | `{profileId,name,instructions,assignees,shots,dueAt}` | 201 `{assignment}`; owner/curator, immutable profile/version snapshot |
| GET `/assignments/{id}` | — | `{assignment,submissions}`; contributor's own statuses only |
| PATCH `/assignments/{id}` | `{closed,revision}` | `{assignment}`; owner/curator, stale revision 409 |
| GET `/submissions` | — | Actor's own shared delivery statuses and feedback, including captures without a task |
| POST `/photos/{id}/review` | `{state,comment,revision}` | Owner/curator decision; nonempty reason for correction/reshoot/rejection |
| POST `/photos/{id}/response` | `{comment,note?,revision}` | Creator reply; optional note obeys completed-field lock |

Roles: `owner`, `curator`, `contributor`, `viewer`. Profile responses include
current `access: {role,readOwnPhotos,manageProfiles}`. Curators manage profiles
only when delegated; invite/member administration remains owner-only. Viewers
read authorized space material and cannot upload, edit, delete or review.
Contributor archive access is either their own photos or none. These checks
apply to GET metadata, both file streams, uploads, updates, deletes and review
actions. Current revocation restrictions take precedence over old snapshots.

Photo manifests may add `assignmentId` and `replacesId`. Assignment profile
version, allowed shots, active assignee and closed status are verified on the
server; a reshoot must reference the same creator/profile/space/task and a live
photo awaiting reshoot. Shared identity, creator, assignment and replacement
bind the immutable fingerprint. Retakes create new originals, not versions.
`dueAt` marks overdue work; explicit closure blocks new submissions. An identical retry of an already committed photo remains acknowledgeable after closure or a later change to the original reshoot decision; current membership and expiry checks still apply.

Shared photo responses add `spaceId`, `creatorId`, `assignmentId`, `replacesId`,
`uploadOnly`, current `access`, `reviewState`, `reviewRevision`, `reviewComment`
and `responseComment`. Review states are `pending`, `accepted`, `correction`,
`reshoot`, `rejected`; review revision is independent of metadata revision.
Delivery status responses expose ID/short ID/shot/time, review and reply, and
authorized actions; never original/thumbnail, caption or GPS. Upload-only
contributors receive upload acknowledgements but GET photo/content returns 403.
Idempotent PATCH may return an already applied identical state for an older
revision; genuinely different stale edits return 409.

GET `/photos` now also returns current `spaces` grants for local reconciliation.
DELETE may include `{spaceId}` to cancel a shared upload before its first
reservation; creator checks prevent cancellation of another contributor's ID.
The frontend removes confirmed upload-only image files and keeps a delivery/GPS
sidecar record until expiry. Offline files previously obtained cannot be recalled.
Prototype request limit is 300/minute per actor; library creation remains 10/minute.
No E2EE, final authentication or production readiness is implied. See the
[stage 3 runbook](../docs/operations/collaboration-prototype.md).
