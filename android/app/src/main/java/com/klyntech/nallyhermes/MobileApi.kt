package com.klyntech.nallyhermes

import android.content.Context
import com.klyntech.nallyhermes.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

internal data class SyncedMessage(
    val id: String,
    val sequence: Long,
    val role: String,
    val text: String,
    val source: String,
    val status: String,
    val createdAt: String
)

internal data class MobileActivitySnapshot(
    val headline: String,
    val provider: String?,
    val isThinking: Boolean,
    val requiresTelegramApproval: Boolean
)

internal data class SyncSnapshot(
    val messages: List<SyncedMessage>,
    val nextSequence: Long,
    val activity: MobileActivitySnapshot?
)

internal data class TelegramLoginChallenge(
    val nonce: String,
    val clientId: String,
    val redirectUri: String,
    val scopes: List<String>
)

internal class MobileApi(context: Context) {
    private val preferences = context.getSharedPreferences("nally_mobile", Context.MODE_PRIVATE)
    private val http = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    val baseUrl: String get() = BuildConfig.API_BASE_URL

    val isPaired: Boolean
        get() = !preferences.getString("access_token", null).isNullOrBlank()

    private fun endpoint(path: String): String {
        val raw = baseUrl.trim().trimEnd('/')
        require(raw.startsWith("https://", ignoreCase = true)) { "A secure connection is unavailable." }
        require(raw.length <= 240 && !raw.contains("/api/mobile")) { "The secure service address is invalid." }
        return raw + path
    }

    private fun request(path: String): Request.Builder {
        val builder = Request.Builder().url(endpoint(path)).header("Accept", "application/json")
        preferences.getString("access_token", null)?.let { builder.header("Authorization", "Bearer $it") }
        return builder
    }

    private suspend fun execute(request: Request): JSONObject = withContext(Dispatchers.IO) {
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val body = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (!response.isSuccessful) {
                if (response.code == 401) preferences.edit().remove("access_token").apply()
                throw IllegalStateException(body.optString("error").ifBlank { "Server returned HTTP ${response.code}." })
            }
            body
        }
    }

    suspend fun pair(code: String) {
        val body = JSONObject().put("code", code.trim()).toString().toRequestBody(jsonType)
        val response = execute(Request.Builder().url(endpoint("/api/mobile/pair")).post(body).build())
        val token = response.optString("accessToken")
        require(token.length >= 40) { "The server returned an invalid session. Please try pairing again." }
        preferences.edit().putString("access_token", token).apply()
    }

    suspend fun createTelegramLoginChallenge(): TelegramLoginChallenge {
        val body = JSONObject().toString().toRequestBody(jsonType)
        val response = execute(Request.Builder().url(endpoint("/api/mobile/login/challenge")).post(body).build())
        val scopesJson = response.optJSONArray("scopes") ?: JSONArray()
        val scopes = buildList {
            for (index in 0 until scopesJson.length()) scopes.add(scopesJson.optString(index))
        }
        val nonce = response.optString("nonce")
        val clientId = response.optString("clientId")
        val redirectUri = response.optString("redirectUri")
        require(nonce.length >= 32 && clientId.isNotBlank() && redirectUri.startsWith("https://")) {
            "Telegram Login is not configured correctly yet."
        }
        return TelegramLoginChallenge(nonce, clientId, redirectUri, scopes)
    }

    suspend fun completeTelegramLogin(idToken: String, nonce: String) {
        val body = JSONObject()
            .put("idToken", idToken)
            .put("nonce", nonce)
            .toString()
            .toRequestBody(jsonType)
        val response = execute(Request.Builder().url(endpoint("/api/mobile/telegram-login")).post(body).build())
        val token = response.optString("accessToken")
        require(token.length >= 40) { "Telegram did not return a valid app session. Please sign in again." }
        preferences.edit().putString("access_token", token).apply()
    }

    suspend fun fetchMessages(afterSequence: Long): SyncSnapshot {
        val cursor = URLEncoder.encode(afterSequence.toString(), "UTF-8")
        val response = execute(request("/api/mobile/messages?afterSequence=$cursor").get().build())
        val source = response.optJSONArray("messages") ?: JSONArray()
        val rows = buildList {
            for (index in 0 until source.length()) {
                val item = source.optJSONObject(index) ?: continue
                add(
                    SyncedMessage(
                        id = item.optString("id"),
                        sequence = item.optLong("sequence"),
                        role = item.optString("role"),
                        text = item.optString("text"),
                        source = item.optString("source"),
                        status = item.optString("status"),
                        createdAt = item.optString("createdAt")
                    )
                )
            }
        }
        val activityJson = response.optJSONObject("activity")
        val activity = activityJson?.let {
            MobileActivitySnapshot(
                headline = it.optString("headline", "Thinking…"),
                provider = it.optString("provider").takeUnless(String::isBlank),
                isThinking = it.optBoolean("isThinking"),
                requiresTelegramApproval = it.optBoolean("requiresTelegramApproval")
            )
        }
        return SyncSnapshot(rows, response.optLong("nextSequence", afterSequence), activity)
    }

    suspend fun sendMessage(clientMessageId: String, text: String) {
        val body = JSONObject()
            .put("clientMessageId", clientMessageId)
            .put("text", text)
            .toString()
            .toRequestBody(jsonType)
        execute(request("/api/mobile/messages").post(body).build())
    }

    suspend fun revoke() {
        if (!isPaired) return
        execute(request("/api/mobile/session").delete().build())
        preferences.edit().remove("access_token").apply()
    }
}
