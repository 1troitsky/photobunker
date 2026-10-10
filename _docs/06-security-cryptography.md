# Security, Cryptography & Threat Model
Статус: security-critical normative spec. Никакой релиз без ревью данных требований.

## 1. Threat model and honest promises
Защитить содержимое фотографий, превью, EXIF, описаний, GPS, editor layers от оператора/администратора сервиса, cloud provider, третьих лиц при перехвате/утечке storage и случайного зрителя при заблокированной галерее. Нельзя обещать защиту от заражённого устройства, украденной recovery phrase, злонамеренного получателя, скриншотов, метаданных сетевого уровня, компрометации поставляемого JavaScript. IP-адрес и размеры ciphertext/времена обращений могут быть видны серверу/провайдеру. Запрещено писать «100% гарантия анонимности».
Связанные файлы: 02 roles, 04 queue, 07 deletion, 09 sharing.

## 2. Architecture
Encryption/decryption ONLY in trusted client. Server stores ciphertext + sealed key envelopes + transport/auth metadata. Encrypt originals, preview thumbnails, GPS/EXIF/notes, metadata revisions, edit manifests, exported derivatives, profile payload, invitations where appropriate.
Для каждого media object — random independently generated file DEK (content encryption key), authenticated encryption with standard vetted library: предпочтительно audited libsodium XChaCha20-Poly1305 with correct nonce domain separation OR vetted WebCrypto AES-256-GCM with strict unique nonce/chunk protocol. Algorithm & format need a reviewed protocol decision **before coding**, not home-grown primitives. Metadata authenticated encryption + explicit format version; bind AAD to vault ID, asset ID, file kind, version, and chunk index; prevent swapping/replay.
For large photos stream/chunk AEAD with independent per-chunk nonces, ordered authenticated manifest / total length; test truncation, splice, reorder, duplicate chunk and malformed ciphertext. Never rely only on HTTPS or provider server-side encryption. Hashes/checksums only of ciphertext where possible; no plaintext hashes exposed to server or unkeyed cross-account dedup.

## 3. Key hierarchy
- Account identity: asymmetric key pair generated on client; public material server may hold. Private identity secret only locally encrypted / recovery-wrapped.
- Vault: random content/group key or root wrapping key + epoch. Per-asset DEK wrapped by Vault key or to authorized individual recipients. Owner/curator get envelopes via authenticated recipient public-key exchange.
- **Capture-only**: server may give submitter Vault encryption public key so it can encrypt a new asset without ability to decrypt existing Vault content. Define compatible recipient decrypt flow and sender authentication. Do not accidentally share Vault symmetric read key with contributor.
- Device: authenticated device binding and key rotation; signed envelopes and recipient verification to resist server substituting an attacker's public key. Design trust-on-first-use/out-of-band verification for high-risk users; document limits if not provided.
- Recovery Kit: high-entropy secret shown locally, user must confirm backup; encrypted recovery bundle stored on server. No support-led account recovery. Losing all device keys + recovery secret means irrevocable loss of decrypt capability.
- Crypto schema versioned and rotation-ready; removal/revocation changes future key epoch. Past downloaded ciphertext and captured keys cannot be recalled; old objects require deliberate rekey/re-encrypt if past access must be revoked.

## 4. PIN is NOT a cryptographic recovery key
Product asks 4/6/8-digit PIN, default gate gallery. A PIN of 4–8 digits is vulnerable to offline brute-force **without hardware/online enforced protection**. Forbidden to store private E2EE root key protected solely by PIN-derived key in attacker-copyable browser storage.
Architecture must distinguish:
A. **UI PIN gate** for casual shoulder-surfing, with rate limit and lock on visibility/idle.
B. **Strong unlock** after browser reload/new device/recovery (high-entropy recovery secret / adequately strong passphrase / verified platform authenticator-backed secret when available).
On platforms that securely bind cryptographic unlock to a rate-limited hardware capability, PIN convenience may be integrated only after capability verification and security review. A browser PIN gate alone cannot guarantee privacy from a technically capable local attacker or malicious same-origin JS. Camera before PIN can use persistent Vault public key, **never** read private keys.
No plain private keys in localStorage, cookies, logs, analytics, URLs, backend or server-side env. Scrub decrypted previews on lock and revoke object URLs; JS memory clearing is best-effort (GC copies cannot be perfectly erased).

## 5. Authentication and anonymity
No email/phone mandatory. Use random ID + cryptographic proof-of-possession, anti-replay challenges and short-lived sessions; CSRF and XSS hardening, rate limiting, session revocation, device list. Recovery/login must not depend on server possessing a decrypt key. Optional nickname.
Prevent free-plan abuse with coarse anonymous quotas, proof-of-work/rate-limited creation and upload checks; no invisible fingerprinting. Remove IP from app logs by default where operationally feasible and publish unavoidable proxy/provider retention.
Do not embed wallets, crypto tx address, geolocation, names in photo object paths.

## 6. Web/PWA supply chain risks
An attacker controlling the web origin can ship malicious JS to exfiltrate keys at next unlock; E2EE of stored ciphertext does not solve this. Enforce HTTPS/HSTS, rigorous CSP (no unsafe-eval and minimum inline scripts), Trusted Types where supported, SRI for static cross-origin assets, dependency lockfiles and supply-chain scanning, restricted access deploy, signed/reproducible release builds and independent audit goals. Third-party analytics/CDNs injecting executable scripts prohibited. Trusted UI URLs only. Document critical unsolved risk rather than claiming web client is trustless. Native/app-store requirement not permitted for core access.

## 7. Data minimization & confidentiality
Never store plaintext previews or derived data on backend; error trackers sanitized (ideally no third-party); secrets removed from Referrer and server logs; fragment-key share links without secret sent to API. No third-party reverse-geocoding by default. Screenshot/OS caches and clipboard cannot be guaranteed absent. Encryption-at-rest for database backups is **in addition** to E2EE, not replacement.
All export paths explicit and warn when decrypted copy is sent to device/other app (outside app's no-system-gallery guarantee).

## 8. Verification requirements
Known-answer crypto vectors; encrypt/decrypt across browser platforms; reject tampered data; wrong recipient cannot decrypt; admin with DB+S3 cannot decrypt; capture while PIN-locked can encrypt but cannot list/read; recovery on new device; stolen server DB/offline PIN attack; revoked new epochs; malformed share fragments; CSP/XSS tests; key rotation; timestamp/metadata integrity; malicious JS risk described in user-facing security doc. External security review before marketing as independently audited.
Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html ; https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
