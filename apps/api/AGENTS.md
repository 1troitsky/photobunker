# API development

This directory contains the Laravel API only. Use the repository Docker Compose PHP service for Composer, Artisan, tests, and Pint; the host does not need PHP or Composer. Do not install host packages or add frontend tooling here.

Read `_docs/06-security-cryptography.md`, `_docs/07-storage-retention-deletion.md`, `_docs/11-architecture-api-contracts.md`, and `_docs/12-quality-acceptance-and-operations.md` at the repository root before changing security, storage, or API contracts. Authentication and E2EE are separate future work: do not add conventional email/password registration as a scaffold.

Never expose exception details, credentials, SQL, request bodies, recovery material, or client plaintext in responses or logs. Use synthetic fixtures for storage checks.
