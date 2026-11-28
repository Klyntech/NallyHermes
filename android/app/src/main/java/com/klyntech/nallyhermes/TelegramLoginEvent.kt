package com.klyntech.nallyhermes

sealed interface TelegramLoginEvent {
    data class Success(val idToken: String) : TelegramLoginEvent
    data class Failure(val message: String) : TelegramLoginEvent
    /** Browser sign-in (Google or GitHub) finished: the one-time code to trade for a session. */
    data class OAuthCode(val code: String) : TelegramLoginEvent
    /** Browser sign-in ended without a session (cancelled, or that login is not linked yet). */
    data class OAuthFailure(val message: String) : TelegramLoginEvent
}
