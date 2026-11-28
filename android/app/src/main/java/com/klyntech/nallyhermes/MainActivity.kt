package com.klyntech.nallyhermes

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.klyntech.nallyhermes.ui.NallyHermesApp
import com.klyntech.nallyhermes.ui.theme.NallyHermesTheme
import kotlinx.coroutines.flow.MutableStateFlow
import org.telegram.login.TelegramLogin

class MainActivity : ComponentActivity() {
    private val loginEvent = MutableStateFlow<TelegramLoginEvent?>(null)
    private val openVoiceRequests = MutableStateFlow(0)
    // Counts launches that should start listening immediately (wake word, assistant gesture).
    private val autoStartVoiceRequests = MutableStateFlow(0)
    private var redirectHost: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val voiceTick by openVoiceRequests.collectAsState()
            val autoStartTick by autoStartVoiceRequests.collectAsState()
            NallyHermesTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    NallyHermesApp(
                        onStartTelegramLogin = ::startTelegramLogin,
                        loginEvents = loginEvent,
                        onLoginEventConsumed = { loginEvent.value = null },
                        openVoiceTick = voiceTick,
                        autoStartVoiceTick = autoStartTick
                    )
                }
            }
        }
        handleLoginIntent(intent)
        handleVoiceIntent(intent)
        // Fail-soft: a bad wake-word enable must never block app launch
        try {
            if (WakeWordPrefs.isEnabled(this) && !WakeWordPrefs.voiceCallActive) {
                WakeWordService.start(this)
            }
        } catch (_: Exception) {
            WakeWordPrefs.setEnabled(this, false)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLoginIntent(intent)
        handleVoiceIntent(intent)
    }

    private fun handleVoiceIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(WakeWordService.EXTRA_OPEN_VOICE, false) == true ||
            intent?.action == WakeWordService.ACTION_OPEN_VOICE
        ) {
            openVoiceRequests.value = openVoiceRequests.value + 1
            if (intent.getBooleanExtra(WakeWordService.EXTRA_AUTO_START, false)) {
                autoStartVoiceRequests.value = autoStartVoiceRequests.value + 1
            }
        }
    }

    private fun startTelegramLogin(challenge: TelegramLoginChallenge) {
        try {
            redirectHost = Uri.parse(challenge.redirectUri).host
            TelegramLogin.init(
                clientId = challenge.clientId,
                redirectUri = challenge.redirectUri,
                scopes = challenge.scopes,
                nonce = challenge.nonce
            )
            TelegramLogin.startLogin(this)
        } catch (error: Exception) {
            loginEvent.value = TelegramLoginEvent.Failure(error.message ?: "Could not start Telegram Login.")
        }
    }

    /** Browser sign-in finished: nallyhermes://auth?code=... (or ?error=...). */
    private fun handleAuthIntent(intent: Intent?): Boolean {
        val uri = intent?.data ?: return false
        if (uri.scheme != "nallyhermes" || uri.host != "auth") return false
        val code = uri.getQueryParameter("code")
        loginEvent.value = if (!code.isNullOrBlank()) {
            TelegramLoginEvent.OAuthCode(code)
        } else {
            TelegramLoginEvent.OAuthFailure(
                when (uri.getQueryParameter("error")) {
                    "not_linked" -> "No Nally account is linked to that login yet. In Telegram, send /linknallyaccount to Nally, link it, then try again."
                    "cancelled" -> "Sign-in was cancelled."
                    else -> "Sign-in could not be completed. Please try again."
                }
            )
        }
        return true
    }
    
    private fun handleLoginIntent(intent: Intent?) {
        if (handleAuthIntent(intent)) return
        val uri = intent?.data ?: return
        val host = uri.host.orEmpty()
        val isTelegramLoginLink = uri.scheme == "https" &&
            uri.path == "/tglogin" &&
            (host == redirectHost || Regex("^app[0-9]+-login\\.tg\\.dev$").matches(host))
        if (!isTelegramLoginLink) return

        runCatching {
            TelegramLogin.handleLoginResponse(
                uri = uri,
                onSuccess = { data -> loginEvent.value = TelegramLoginEvent.Success(data.idToken) },
                onError = { _ -> loginEvent.value = TelegramLoginEvent.Failure("Telegram sign-in was cancelled or could not be completed. Please try again.") }
            )
        }.onFailure { error ->
            loginEvent.value = TelegramLoginEvent.Failure(error.message ?: "Telegram sign-in could not be completed.")
        }
    }
}
