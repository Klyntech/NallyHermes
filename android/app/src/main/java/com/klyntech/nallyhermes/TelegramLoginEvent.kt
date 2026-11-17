package com.klyntech.nallyhermes

sealed interface TelegramLoginEvent {
    data class Success(val idToken: String) : TelegramLoginEvent
    data class Failure(val message: String) : TelegramLoginEvent
}
