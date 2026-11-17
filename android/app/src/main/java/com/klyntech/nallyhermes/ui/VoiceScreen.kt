package com.klyntech.nallyhermes.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.klyntech.nallyhermes.MobileApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

/** Native voice session states. */
enum class VoiceUiState { Ready, Connecting, Listening, Thinking, Tool, Speaking, Interrupted, Reconnecting, Denied, Ended }

@Composable
internal fun VoiceScreen(onSettings: () -> Unit, api: MobileApi, onTextSubmitted: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var gateVisible by rememberSaveable { mutableStateOf(true) }
    var muted by rememberSaveable { mutableStateOf(false) }
    var captionsOn by rememberSaveable { mutableStateOf(false) }
    var keyboardOn by rememberSaveable { mutableStateOf(false) }
    var endArmed by rememberSaveable { mutableStateOf(false) }
    var draft by rememberSaveable { mutableStateOf("") }
    var localNotice by remember { mutableStateOf<String?>(null) }
    var state by remember { mutableStateOf(VoiceUiState.Ready) }
    var caption by remember { mutableStateOf<String?>(null) }
    var session by remember { mutableStateOf<NativeVoiceSession?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            gateVisible = false
            beginVoiceSession(
                api, context, scope,
                onSession = { session = it },
                onState = { state = it },
                onCaption = { caption = it },
                onError = { msg -> localNotice = msg; gateVisible = true },
                onEnded = { session = null; gateVisible = true }
            )
        } else { state = VoiceUiState.Denied; localNotice = "Microphone permission is needed. Allow it to start a call." }
    }
    DisposableEffect(lifecycle, session, state) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                session?.stop("app backgrounded"); session = null
                if (state != VoiceUiState.Ready) state = VoiceUiState.Ended
                localNotice = "Voice session ended when the app went to the background. Start again when ready."
            }
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    // Only stop when leaving the Voice screen, not when the session object reference updates.
    DisposableEffect(Unit) {
        onDispose { session?.stop("voice screen closed") }
    }
    val colors = MaterialTheme.colorScheme
    Column(modifier.fillMaxSize().imePadding().background(colors.background).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth().padding(top = 20.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onSettings) { Text("‹  Settings") }
            Text("Voice", style = MaterialTheme.typography.titleMedium, color = colors.onSurface)
            Spacer(Modifier.width(68.dp))
        }
        Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            VoiceOrb(state, modifier = Modifier.size(if (keyboardOn) 150.dp else 240.dp))
            Spacer(Modifier.height(30.dp))
            Text(when (state) {
                VoiceUiState.Ready -> "Ready when you are"; VoiceUiState.Connecting -> "Connecting…"
                VoiceUiState.Listening, VoiceUiState.Interrupted -> "Listening…"; VoiceUiState.Thinking -> "Thinking…"
                VoiceUiState.Tool -> "Working…"; VoiceUiState.Speaking -> "Speaking…"; VoiceUiState.Reconnecting -> "Reconnecting…"
                VoiceUiState.Denied -> "Voice unavailable"; VoiceUiState.Ended -> "Call ended"
            }, style = MaterialTheme.typography.headlineSmall, color = colors.onSurface)
            Spacer(Modifier.height(10.dp))
            val shownCaption = if (captionsOn) caption else null
            Text(shownCaption ?: (localNotice ?: if (state == VoiceUiState.Ready) "Start to connect to voice." else ""),
                style = MaterialTheme.typography.bodyMedium, color = if (shownCaption != null) colors.onSurface else colors.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(0.88f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        AnimatedVisibility(visible = keyboardOn) {
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(16.dp)).background(colors.surfaceVariant).padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(value = draft, onValueChange = { draft = it }, modifier = Modifier.weight(1f), singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), textStyle = MaterialTheme.typography.bodyLarge.copy(color = colors.onSurface),
                    decorationBox = { inner -> if (draft.isEmpty()) Text("Type a message", color = colors.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge); inner() })
                TextButton(onClick = { val text = draft.trim(); if (text.isNotEmpty()) { onTextSubmitted(text); draft = ""; localNotice = null } }) { Text("Send") }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 26.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            VoiceControl(if (muted) "Mic off" else "Mic", muted, Modifier.weight(1f)) { muted = !muted; session?.setMuted(muted) }
            VoiceControl(if (captionsOn) "CC on" else "CC", captionsOn, Modifier.weight(1f)) { captionsOn = !captionsOn }
            VoiceControl(if (keyboardOn) "Hide keys" else "Keyboard", keyboardOn, Modifier.weight(1f)) { keyboardOn = !keyboardOn }
            Button(onClick = { if (!endArmed) endArmed = true else {
                endArmed = false; session?.stop(); session = null; state = VoiceUiState.Ended; gateVisible = true; localNotice = "Call ended."
            } }, modifier = Modifier.weight(1.15f).height(48.dp), shape = RoundedCornerShape(24.dp), colors = ButtonDefaults.buttonColors(
                containerColor = if (endArmed) colors.error else colors.errorContainer, contentColor = if (endArmed) colors.onError else colors.error
            )) { Text(if (endArmed) "Tap to end" else "End", style = MaterialTheme.typography.labelLarge) }
        }
    }
    AnimatedVisibility(visible = gateVisible, modifier = Modifier.fillMaxSize()) {
        Surface(color = colors.background.copy(alpha = 0.98f)) {
            Column(Modifier.fillMaxSize().padding(horizontal = 28.dp, vertical = 32.dp), verticalArrangement = Arrangement.Bottom) {
                VoiceOrb(VoiceUiState.Ready, modifier = Modifier.align(Alignment.CenterHorizontally).size(172.dp))
                Spacer(Modifier.height(28.dp))
                Text(if (state == VoiceUiState.Denied) "Microphone access needed" else "Talk, don't type", style = MaterialTheme.typography.headlineLarge, color = colors.onSurface)
                Spacer(Modifier.height(8.dp))
                Text(localNotice ?: "Voice uses your microphone and a secure, short-lived connection. Audio is streamed only while this call is active.", style = MaterialTheme.typography.bodyLarge, color = colors.onSurfaceVariant)
                Spacer(Modifier.height(20.dp))
                Text("Microphone access is requested only after you tap Start.", style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
                Spacer(Modifier.height(20.dp))
                Button(onClick = {
                    localNotice = null
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        gateVisible = false
                        beginVoiceSession(
                api, context, scope,
                onSession = { session = it },
                onState = { state = it },
                onCaption = { caption = it },
                onError = { msg -> localNotice = msg; gateVisible = true },
                onEnded = { session = null; gateVisible = true }
            )
                    } else permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp)) { Text(if (state == VoiceUiState.Denied) "Try again" else "Start", style = MaterialTheme.typography.titleMedium) }
            }
        }
    }
}

private fun beginVoiceSession(
    api: MobileApi,
    context: Context,
    scope: CoroutineScope,
    onSession: (NativeVoiceSession?) -> Unit,
    onState: (VoiceUiState) -> Unit,
    onCaption: (String?) -> Unit,
    onError: (String) -> Unit,
    onEnded: () -> Unit = {}
) {
    scope.launch {
        onState(VoiceUiState.Connecting)
        try {
            val ticket = api.createVoiceTicket()
            var serverErrorShown = false
            val voice = NativeVoiceSession(context.applicationContext, api.voiceWebSocketUrl(ticket)) { event ->
                Handler(Looper.getMainLooper()).post {
                    when (event) {
                        NativeVoiceSession.Event.Connected -> onState(VoiceUiState.Connecting)
                        is NativeVoiceSession.Event.State -> onState(event.state)
                        is NativeVoiceSession.Event.Caption -> onCaption(event.text)
                        is NativeVoiceSession.Event.Error -> {
                            serverErrorShown = true
                            onError(event.message)
                        }
                        NativeVoiceSession.Event.Ended -> {
                            if (!serverErrorShown) {
                                onState(VoiceUiState.Ended)
                                onError("Call ended before voice was ready. Open Settings or retry — the detailed reason is shown above when the server reports one.")
                            } else {
                                onState(VoiceUiState.Ended)
                            }
                            onEnded()
                        }
                    }
                }
            }
            onSession(voice)
            voice.connect()
        } catch (error: Exception) {
            onState(VoiceUiState.Denied)
            onError(error.message ?: "Could not create a secure voice session (ticket). Is the app paired and is voice enabled on the server?")
        }
    }
}

@Composable
private fun VoiceControl(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Surface(
        modifier = modifier.height(48.dp).clip(CircleShape).clickable(onClick = onClick),
        shape = CircleShape,
        color = if (selected) colors.secondaryContainer else colors.surfaceVariant,
        border = androidx.compose.foundation.BorderStroke(1.dp, colors.outlineVariant)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = if (selected) colors.onSecondaryContainer else colors.onSurfaceVariant)
        }
    }
}

@Composable
private fun VoiceOrb(state: VoiceUiState, modifier: Modifier = Modifier) {
    val colors = MaterialTheme.colorScheme
    val transition = rememberInfiniteTransition(label = "voice-orb")
    val breathe by transition.animateFloat(
        initialValue = 0.94f, targetValue = 1.04f,
        animationSpec = infiniteRepeatable(tween(if (state == VoiceUiState.Thinking || state == VoiceUiState.Tool) 850 else 2100, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "orb-breathe"
    )
    val spin by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(1500, easing = LinearEasing)), label = "orb-spin")
    val levelTarget = when (state) {
        VoiceUiState.Listening, VoiceUiState.Interrupted -> 0.12f
        VoiceUiState.Speaking -> 0.18f
        else -> 0f
    }
    val level by animateFloatAsState(levelTarget, tween(250), label = "orb-level")
    val tint = when (state) {
        VoiceUiState.Listening, VoiceUiState.Interrupted -> colors.primary
        VoiceUiState.Speaking -> colors.tertiary
        VoiceUiState.Thinking, VoiceUiState.Tool -> colors.secondary
        VoiceUiState.Denied, VoiceUiState.Ended -> colors.outline
        else -> colors.primary.copy(alpha = 0.78f)
    }
    val haloTint = when (state) {
        VoiceUiState.Listening, VoiceUiState.Interrupted, VoiceUiState.Speaking -> tint.copy(alpha = 0.25f)
        else -> colors.primaryContainer.copy(alpha = 0.65f)
    }
    val coreScale = if (state == VoiceUiState.Denied || state == VoiceUiState.Ended) 0.88f else breathe + level * 0.3f

    Canvas(modifier = modifier) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val unit = size.minDimension
        drawCircle(
            brush = Brush.radialGradient(listOf(haloTint.copy(alpha = 0.55f), haloTint.copy(alpha = 0.16f), Color.Transparent), center, unit * 0.49f),
            radius = unit * 0.49f,
            center = center
        )
        drawCircle(
            color = tint.copy(alpha = 0.24f),
            radius = unit * 0.43f * (1f + level * 0.3f),
            center = center,
            style = Stroke(width = unit * 0.0045f)
        )
        if (state == VoiceUiState.Connecting) {
            drawArc(
                brush = Brush.sweepGradient(listOf(tint, tint.copy(alpha = 0f), tint.copy(alpha = 0f), tint)),
                startAngle = spin,
                sweepAngle = 104f,
                useCenter = false,
                topLeft = Offset(unit * 0.08f, unit * 0.08f),
                size = androidx.compose.ui.geometry.Size(unit * 0.84f, unit * 0.84f),
                style = Stroke(width = unit * 0.006f)
            )
        } else {
            drawCircle(color = tint.copy(alpha = 0.10f), radius = unit * 0.42f, center = center, style = Stroke(width = unit * 0.004f))
        }
        val coreRadius = unit * 0.29f * coreScale
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(colors.surface.copy(alpha = 0.35f), tint, tint.copy(alpha = 0.68f)),
                center = Offset(center.x - coreRadius * 0.35f, center.y - coreRadius * 0.42f),
                radius = coreRadius * 2.25f
            ),
            radius = coreRadius,
            center = center
        )
        drawCircle(
            color = Color.White.copy(alpha = 0.12f),
            radius = coreRadius * 0.88f,
            center = Offset(center.x - coreRadius * 0.14f, center.y - coreRadius * 0.18f),
            style = Stroke(width = unit * 0.003f)
        )
    }
}
