package com.klyntech.nallyhermes.companion

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import com.klyntech.nallyhermes.companion.protocol.CompanionRequest
import com.klyntech.nallyhermes.companion.protocol.CompanionResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Bound service that exposes the Companion to other components inside the app.
 *
 * Not exported — only the NallyHermes process can bind to it.
 * Future: can be elevated to a foreground service if long-running device
 * sessions (e.g. continuous notification listening) are added.
 */
class NallyMobileCompanionService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private val binder = LocalBinder()

    inner class LocalBinder : Binder() {
        fun getService(): NallyMobileCompanionService = this@NallyMobileCompanionService
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    /**
     * Execute a request and deliver the result on the main thread via [onResult].
     */
    fun execute(request: CompanionRequest, onResult: (CompanionResult) -> Unit) {
        scope.launch {
            val result = NallyMobileCompanion.execute(this@NallyMobileCompanionService, request)
            onResult(result)
        }
    }

    fun executeJson(raw: JSONObject, onResult: (CompanionResult) -> Unit) {
        scope.launch {
            val result = NallyMobileCompanion.executeJson(this@NallyMobileCompanionService, raw)
            onResult(result)
        }
    }

    fun supportedActions(): Set<String> = NallyMobileCompanion.supportedActions()

    fun catalogue(): List<Map<String, String>> = NallyMobileCompanion.catalogue()
}
