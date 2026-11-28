package com.klyntech.nallyhermes

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/** PKCE (S256) for the browser sign-in: the server only hands the session to whoever holds the verifier. */
internal object OAuthPkce {
    data class PkcePair(val verifier: String, val challenge: String)

    private const val FLAGS = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP

    fun create(): PkcePair {
        val bytes = ByteArray(48).also { SecureRandom().nextBytes(it) } // 64-character verifier
        val verifier = Base64.encodeToString(bytes, FLAGS)
        return PkcePair(verifier, challengeFor(verifier))
    }

    fun challengeFor(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
        return Base64.encodeToString(digest, FLAGS)
    }
}
