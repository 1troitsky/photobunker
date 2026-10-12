import sodium from 'libsodium-wrappers'

// Library compatibility only: no app wire format, vault, auth or recovery codec.
self.onmessage = async () => {
  const started = performance.now()
  try {
    await sodium.ready
    const key = sodium.crypto_secretstream_xchacha20poly1305_keygen()
    const recipient = sodium.crypto_box_keypair()
    const sealed = sodium.crypto_box_seal(key, recipient.publicKey)
    const opened = sodium.crypto_box_seal_open(sealed, recipient.publicKey, recipient.privateKey)
    if (!sodium.memcmp(key, opened)) throw new Error('sealed.roundtrip')
    const other = sodium.crypto_box_keypair()
    let wrongRecipientRejected = false
    try { wrongRecipientRejected = !sodium.crypto_box_seal_open(sealed, other.publicKey, other.privateKey) }
    catch { wrongRecipientRejected = true }
    if (!wrongRecipientRejected) throw new Error('sealed.wrong_recipient')

    const push = sodium.crypto_secretstream_xchacha20poly1305_init_push(key)
    const pull = sodium.crypto_secretstream_xchacha20poly1305_init_pull(push.header, opened)
    const chunkBytes = 1024 * 1024
    const chunk = new Uint8Array(chunkBytes)
    const aad = new TextEncoder().encode('photobunker/i02/library-probe-not-wire-format')
    let finalVerified = false
    let tamperRejected = false
    for (let index = 0; index < 8; index++) {
      chunk.fill(index + 1)
      const tag = index === 7 ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE
      const ciphertext = sodium.crypto_secretstream_xchacha20poly1305_push(push.state, chunk, aad, tag)
      if (index === 0) {
        const corrupt = ciphertext.slice()
        corrupt[corrupt.length - 1] ^= 1
        const fresh = sodium.crypto_secretstream_xchacha20poly1305_init_pull(push.header, opened)
        try { tamperRejected = !sodium.crypto_secretstream_xchacha20poly1305_pull(fresh, corrupt, aad) }
        catch { tamperRejected = true }
      }
      const result = sodium.crypto_secretstream_xchacha20poly1305_pull(pull, ciphertext, aad)
      if (!result || !sodium.memcmp(result.message, chunk) || result.tag !== tag) throw new Error('stream.roundtrip')
      finalVerified = result.tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
      sodium.memzero(result.message)
    }
    sodium.memzero(chunk)
    sodium.memzero(key)
    sodium.memzero(opened)
    sodium.memzero(recipient.privateKey)
    sodium.memzero(other.privateKey)
    if (!finalVerified || !tamperRejected) throw new Error('stream.validation')
    self.postMessage({ ok: true, data: { library: sodium.sodium_version_string(), bytes: chunkBytes * 8, chunkBytes, elapsedMs: Math.round(performance.now() - started), finalVerified, tamperRejected, wrongRecipientRejected } })
  } catch {
    self.postMessage({ ok: false, code: 'crypto.library_probe_failed' })
  }
}
