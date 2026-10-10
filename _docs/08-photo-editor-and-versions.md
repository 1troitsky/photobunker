# Photo Editor & Non-destructive Versions
Статус: продуктовый и технический контракт редактора.

## 1. Placement and privacy
Photo is captured, client-encrypted, uploaded and verified first; later user/curator unlocks gallery, retrieves encrypted original/manifest, decrypts only locally, edits in client and re-encrypts changes before uploading. Server NEVER handles plaintext image, previews, annotations or export. Если фото ещё local-only, базовое редактирование допустимо по осознанному UX решению, но основной рекомендованный workflow — после cloud confirmation; guard against edits disappearing when outbox unsynced.

## 2. Mandatory tools
- Text: editable layers, font family from bundled fonts, size, weight, opacity, color, background/outline, drag/rotate/resize.
- Draw: pencil/freehand, highlighter, erase only current stroke/layer, stroke width/color/opacity.
- Shapes: line, arrow, rect, ellipse, move/transform.
- Geometry: crop aspect/free, rotate 90/angle, horizontal/vertical flip, straighten if feasible; preserve original resolution metadata and orientation.
- Adjust: brightness, contrast, exposure if feasible, saturation, warmth, highlights/shadows basic; adjustments stack non-destructively with numerical values.
- Privacy/redact: selected region pixelate/blur for visual preview, and **irreversible flattened export** that prevents original or masks from being leaked to recipient; avoid sending layered JSON or original together with redacted export.
- Undo/redo across supported transformations, reset selected/whole, compare before/after.
- Pan/zoom, touch gestures with handles large enough on mobile, mouse/keyboard shortcuts on desktop. Touch drawing should not inadvertently scroll page.
No need for Lightroom/Photoshop feature parity or server image pipelines.

## 3. Internal version representation
Asset original immutable forever until expiry. Editor writes encrypted versioned document containing array of edit operations/layers with stable IDs, parameters, normalized coordinates based on original dimensions, order/Z-index, color space, crop coordinate system, source asset SHA/manifest reference, editor schema version and created_by. Sidecars and edits encrypted & authenticated with own random key/envelopes; revisions append-only, parent_revision ID / optimistic concurrency version.
Each photo can have: Original + Working draft (local encrypted if offline) + Revision 1..N + export render(s). Default gallery previews generated **locally** and uploaded encrypted (not server rendered); intermediate previews are ephemeral memory-only unless user-approved encrypted offline cache.
When same photo is edited on two devices concurrently, do not overwrite; conflict shown as two branches/versions, allow choose/merge appropriate compatible layers later. Version deletion obeys parent TTL.

## 4. Suggested implementation constraints
Canvas/WebGL/offscreen worker depending browser; evaluate maintained drawing engine e.g. Fabric.js but avoid coupling internal edit schema to undocumented library serializations. Define app-owned stable JSON edit schema, use adapter to Fabric/canvas renderer. Handle Exif orientation, high-resolution memory pressure, JPEG/HEIC/WebP decoding availability, color profile, font licensing and deterministic export.
For large assets render reduced proxy for UI responsiveness while preserving full-resolution non-destructive original and applying edits at export; do not silently degrade original. Capture and edit quality vary with browser hardware and codec support; display supported formats and errors.

## 5. Export / share
Export original unchanged, edited flattened copy or redacted safe derivative. Explicitly warn that **export/download** produces plaintext on user's device and may be saved by browser/OS; normal camera workflow never writes to Photos Gallery. Public sharing must define **which** version(s) and whether originals are exposed. Default for privacy redaction: recipient gets only flattened redacted derivative, never the original/JSON masks. Optional visible watermark added to export, NEVER burned into original. Cryptographic origin metadata/history cannot be presented as proof of real-world truth.

## 6. Permissions
Viewer cannot modify. Contributor may edit own photo if Vault profile allows. Curator can annotate/edit and review, but profile may restrict editorial modifications when authenticity matters; in strict profile keep original, allow clearly-labeled annotations as sidecar separate from photo. Every version records pseudonymous actor and conflict-safe audit **inside encrypted metadata**. Server verifies ACL but cannot inspect correctness of edit ops.

## 7. UX save states
Unsaved local changes indicator, Uploading encrypted edits, Saved in cloud, Conflict, Save failed; autosave draft **encrypted locally** only and recoverable if browser storage survives; no false cloud-saved state. When photo expires during edit, stop save/export/share or warn and cancel as policy requires. Long operation can be cancelled; discard confirmation only when unsaved operations exist.

## 8. Tests
Text after reopen, Unicode Cyrillic fonts, RTL language, multi-touch, redaction doesn't leak original, edit JSON schema migration, simultaneous edits conflict, encrypted saving after reload, network drop, expired photo during save, 48MP image memory handling, export match preview within reasonable visual tolerance, incorrect orientation correction.
