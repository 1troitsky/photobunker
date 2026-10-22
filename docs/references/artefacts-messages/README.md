# Artefacts → PhotoBunker messenger reference snapshots

These three specifications originated in [Artefacts OS PR #16](https://github.com/1troitsky/artefacts-os/pull/16), merged at commit `85789c47287b42a73a21c5335ad67bacabe48110` on 2026-10-21:

- [Product inventory and semantics](MESSAGES-PRODUCT.md)
- [One shared Vue UI / two independent adapters](MESSAGES-ARCHITECTURE.md)
- [Acceptance coverage and original Artefacts-first M00–M09 order](MESSAGES-ACCEPTANCE.md)

These are **read-only reference snapshots**, not PhotoBunker operating instructions. Their original G8 phase gates, Laravel/PostgreSQL choices, server-readable messaging policy, and Artefacts-specific timelines **do not apply** to PhotoBunker. PhotoBunker must keep the existing Matrix E2EE and identity/key/device model, encrypted attachment lifecycle, privacy guarantees and browser limitations. For PhotoBunker implementation precedence, follow [PhotoBunker messenger Chatify port](../../product/messenger-chatify-port.md), [current messenger UX](../../product/messenger-ux.md), [direct voice/E2EE ADR](../../adr/0016-direct-messenger-and-voice.md), [Matrix recovery ADR](../../adr/0007-matrix-messaging-and-recovery.md), and relevant security ADRs.

If product requirements conflict, implement the stricter PhotoBunker privacy behavior and record a deliberate product-specific decision. Do not silently redefine an unimplemented feature as implemented.

**Future portability:** A single versioned Vue/TS presentation package consumed by PhotoBunker and Artefacts via **different** typed adapters is the end state. Mirroring docs, copying UI code to both repositories or replacing the Matrix SDK with Chatify's Laravel backend is *not* that end state.
