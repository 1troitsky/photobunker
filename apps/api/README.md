# PhotoBunker API

Laravel 13 JSON API foundation. Runtime, local setup, and Compose commands are documented in the repository README. Host PHP/Composer are not required.

This foundation implements infrastructure only. Anonymous authentication, client encryption, capture, upload/finalize, and retention policies are subsequent changes. The Laravel `APP_KEY` is a framework secret, never a user's photo decryption key.

| Route | Purpose | Result |
| --- | --- | --- |
| `GET /api/v1/health` | Process liveness; no dependency calls | `200 {"status":"ok"}` |
| `GET /api/v1/ready` | Database connectivity using `SELECT 1` | `200 {"status":"ready"}` or sanitized `503` |

Readiness does not establish that uploads or storage are healthy. It never writes to storage. Use the operator command `php artisan photobunker:storage-check --signed` to test the private S3 adapter with a random 64-byte synthetic fixture: PUT, HEAD, GET, 30-second signed PUT/GET, anonymous GET denial, DELETE, and HEAD absence verification. Cleanup runs on failure too; a cleanup failure prints only the random diagnostic object key and exits nonzero. No credentials, provider error messages, or signed URLs are printed.

`php artisan photobunker:storage-configure` configures explicit browser CORS origins from `AWS_CORS_ALLOWED_ORIGINS`; the command is restricted to local/testing. The SDK uses `AWS_ENDPOINT` for private container access. The `s3-browser` disk uses `AWS_BROWSER_ENDPOINT` exclusively to sign URLs with a host reachable by the browser. Replacing a hostname after signing invalidates an S3 signature. Browser connectivity and CORS are verified by the root integration checks.

All API errors use `error.code`, `error.message_key`, `error.request_id`, and `error.retryable`; internal exception details stay out of responses even if debug is accidentally enabled. Server-generated request IDs, no-store, no-referrer, nosniff, and a restrictive JSON CSP apply to responses. Exception reports contain only class and request ID; future application logs must follow the same data minimization rule.

The only application migrations are queue and cache infrastructure. There are no conventional users, password resets, or database sessions. API routes currently do not start browser sessions.

Tests use isolated in-memory SQLite. Run `composer test` and `composer lint` in the PHP container. The root integration checks exercise PostgreSQL and Garage separately. This step does not implement camera APIs and therefore makes no mobile or E2EE reliability claim.

Requirements: `_docs/06-security-cryptography.md` (confidentiality and logs), `_docs/07-storage-retention-deletion.md` (private provider abstraction), `_docs/11-architecture-api-contracts.md` (versioned JSON and errors), `_docs/12-quality-acceptance-and-operations.md` (failure checks and synthetic fixtures).
