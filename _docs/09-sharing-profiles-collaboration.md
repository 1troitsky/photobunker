# Sharing, Collaboration, Profiles & Curation
Статус: продуктовый контракт приватных и совместных сценариев.

## 1. Vault model
Private Vault: default one account owner, no obligatory curator/profile, full archive and expiration. Shared Vault: owner invites curator/contributor/viewer, optionally creates profiles and assignments. Both have identical E2EE/storage/retention guarantees. Do not make separate organization/account product.

## 2. Invitations and encrypted roles
- Invitation recipient: account public key exchange or bearer invite scoped to uploader-only; server stores opaque token hashes, expiry, max-uses, intended role, Vault ID, revocation flag; no plaintext invitation secrets in logs.
- Key envelopes: encrypt Vault read keys to authorized recipient(s); for capture-only provide only encryption public key, uploader capability, no decrypt key.
- The link may transport a decryption secret in URL **fragment** (not query; never send fragment in HTTP requests); client should strip sensitive referrer on navigation and warn against forwarding. The server does not see fragment by design when implemented correctly; malicious hosted JS caveat from 06 remains.
- Expiring/revocable shares, optional passphrase (if not weak), access limits are best effort and must be server-enforced; already downloaded decrypted bytes cannot be recalled.
- Viewer can view shared selected versions, unless share specifies edited-only. Invite and file access must check both server ACL and actual crypto permission.
- Create, revoke, rotate epoch, remove member: publish exact semantics. Removed member loses future server requests and **future keys**. Past keys/files remain compromised if previously known; robust retroactive revocation requires re-encrypting past accessible objects under new keys and not guaranteeing deletion of copies.

## 3. Profile definition and settings
Encrypted profile payload fields (names optional/required driven by curator):
- purpose/title/instructions, context category list, tags, location city/region/geofence (opt-in privacy), description requirements;
- metadata policy: GPS disabled/optional/required, desired accuracy threshold meters, allowed pending state, min/max delay, EXIF policy, captured_at;
- editing policy: any, only annotations, curated edits, immutable original always; watermark stamp only on export;
- review: auto accepted or pending review, required shot list, notes;
- scope: private, shared, assignment-only; author permissions, viewer permissions;
- profile version and snapshot on each photo. Profile rules cannot grant rights beyond Vault and cannot remove TTL bounds.
UI on capture: context selected in 1 tap, remember session, make camera usable with no profile. Category can be chosen before shooting and deferred after. If GPS missing / incomplete, mark incomplete, never delete a captured photo automatically solely because GPS couldn't lock (except separate TTL).

## 4. Assignment / session
Assignment = bound profile/version, description, participants, optional time window, target number/shot list; a contributor starts CaptureSession with Vault + assignment + category and shoots repeated shots without navigating form. Curator sees inbox reviewable submissions, can accept, reject with reason, comment on encrypted metadata, request retake or more photos. Session can close without exposing all Vault photos to submitter.
Review states: SUBMITTED, NEEDS_METADATA, PENDING_REVIEW, APPROVED, CHANGES_REQUESTED, REJECTED; not equivalent to upload status. Only curator/owner can set review states (server ACL); encrypted reasons editable by authorized users.
Live Gallery uses polling/Server-Sent Events for **opaque update IDs only**, not plaintext thumbnails; subscribing devices fetch/decrypt locally. No need for expensive full real-time collaborative drawing.

## 5. Private one-off sharing
User creates link limited to one asset/version/album, expiry <= original expiry, desired read/download permission (download prevention cannot be guaranteed), optional link passphrase, revocation. Recipients can access no other account metadata. UI shows prominent “anyone with this link+secret can see this content”; recommend same-origin routing with fragment secret. Link sharing cannot bypass Vault retention/capacity.
Public gallery publishing **not default**, no search indexing, no social feed.

## 6. Notifications
Small private in-app inbox: photo delivered, edited, review requested, invitation; encrypted notification bodies. Optional browser push only generic nonsensitive text («Есть новое событие»), opt-in, no GPS, names or thumbnails in push payload. Never require background push for correctness.
All notices must distinguish queue/local/cloud states, and must not reveal photos behind PIN.

## 7. Abuse boundary
Anonymous upload links could be abused. Apply bounded uploads, quota reservation, short-lived invite, rate-limit and cleanup. E2EE operator cannot automatically inspect images; published abuse response cannot promise server-side content moderation/decryption. Protect against spam, unauthorized access and DoS with metadata-only controls. Handle reports of shared links with procedural blocking, without pretending provider reads encrypted content.

## 8. Acceptance
Photographer with upload-only key cannot decrypt curator archives; owner + curator independently can; all profiles applied for new captures without extra pre-shutter form; editing versions stay in shared Vault; revoked link returns denial; expiration wins over an old invite; reviewer never sees encrypted-only metadata in server logs; notifications reveal no personal information.
