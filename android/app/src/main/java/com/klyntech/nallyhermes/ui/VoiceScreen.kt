package com.klyntech.nallyhermes.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.klyntech.nallyhermes.MobileApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.random.Random

/** Native voice session states — same set as multi-sector / mockup. */
enum class VoiceUiState {
    Ready, Connecting, Listening, Thinking, Tool, Speaking, Interrupted, Reconnecting, Denied, Ended
}

// Exact palette from multi-sector MainActivity + mockup
private val Background = Color(0xFF0D0E10)
private val SurfaceDark = Color(0xFF16181C)
private val BorderDark = Color(0xFF272B31)
private val MainText = Color(0xFFECEBE6)
private val HintText = Color(0xFF8A8F98)
private val Danger = Color(0xFFE07A6A)

@Composable
internal fun VoiceScreen(
    onSettings: () -> Unit,
    api: MobileApi,
    onTextSubmitted: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current
    var gateVisible by remember { mutableStateOf(true) }
    var localNotice by remember { mutableStateOf<String?>(null) }
    var state by remember { mutableStateOf(VoiceUiState.Ready) }
    var caption by remember { mutableStateOf<String?>(null) }
    var session by remember { mutableStateOf<NativeVoiceSession?>(null) }
    var muted by remember { mutableStateOf(false) }
    var captionsOn by remember { mutableStateOf(true) }
    var keyboardOn by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var endArmed by remember { mutableStateOf(false) }
    var audioLevel by remember { mutableFloatStateOf(0f) }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            gateVisible = false
            localNotice = null
            beginVoiceSession(
                api, context, scope,
                onSession = { session = it },
                onState = { state = it },
                onCaption = { caption = it },
                onError = { msg -> localNotice = msg; gateVisible = true },
                onEnded = { session = null; gateVisible = true }
            )
        } else {
            state = VoiceUiState.Denied
            localNotice = "Microphone permission is needed. Allow it to start a call."
        }
    }

    LaunchedEffect(state, muted) {
        if (state != VoiceUiState.Listening && state != VoiceUiState.Speaking) {
            audioLevel = 0f
            return@LaunchedEffect
        }
        var v = 0f
        var target = 0f
        var phrase = 0
        while (isActive) {
            if (phrase <= 0) {
                phrase = 3 + Random.nextInt(5)
                val pause = Random.nextFloat() < 0.3f
                target = when {
                    muted && state == VoiceUiState.Listening -> 0f
                    pause -> 0.04f
                    state == VoiceUiState.Speaking -> 0.4f + Random.nextFloat() * 0.5f
                    else -> 0.15f + Random.nextFloat() * 0.4f
                }
            }
            phrase--
            v += (target - v) * (if (target > v) 0.5f else 0.12f)
            audioLevel = v
            delay(66)
        }
    }

    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) {
                val active = state == VoiceUiState.Connecting || state == VoiceUiState.Listening ||
                    state == VoiceUiState.Thinking || state == VoiceUiState.Tool ||
                    state == VoiceUiState.Speaking || state == VoiceUiState.Interrupted
                if (active) {
                    session?.stop("app backgrounded")
                    session = null
                    state = VoiceUiState.Ended
                    localNotice = "Voice session ended when the app went to the background. Start again when ready."
                    gateVisible = true
                }
            }
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    DisposableEffect(Unit) {
        onDispose { session?.stop("voice screen closed") }
    }

    LaunchedEffect(endArmed) {
        if (endArmed) {
            delay(2500)
            endArmed = false
        }
    }

    val statusText = when (state) {
        VoiceUiState.Ready -> "Ready"
        VoiceUiState.Connecting -> "Connecting…"
        VoiceUiState.Listening -> "Listening"
        VoiceUiState.Thinking -> "Thinking"
        VoiceUiState.Tool -> "Working"
        VoiceUiState.Speaking -> "Speaking"
        VoiceUiState.Interrupted -> "Listening"
        VoiceUiState.Reconnecting -> "Reconnecting…"
        VoiceUiState.Denied -> localNotice ?: "Microphone access needed"
        VoiceUiState.Ended -> "Call ended"
    }

    // Transparent so shared chat blur shows (no edge bleed)
    Box(modifier.fillMaxSize().imePadding()) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(bottom = 72.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = if (keyboardOn) Arrangement.Top else Arrangement.Center
            ) {
                if (keyboardOn) Spacer(Modifier.height(24.dp))

                // Exact OpenGL orb from multi-sector-agent
                GlVoiceOrb(
                    state = state,
                    level = audioLevel,
                    modifier = Modifier.size(if (keyboardOn) 128.dp else 240.dp)
                )

                Spacer(Modifier.height(if (keyboardOn) 20.dp else 40.dp))

                Text(
                    text = statusText,
                    color = if (state == VoiceUiState.Denied) HintText else MainText,
                    fontSize = if (state == VoiceUiState.Denied) 17.sp else 26.sp,
                    fontWeight = if (state == VoiceUiState.Denied) FontWeight.Normal else FontWeight.Medium,
                    letterSpacing = (-0.015).sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 300.dp)
                )

                val shownCaption = when {
                    !captionsOn -> null
                    !caption.isNullOrBlank() -> caption
                    !localNotice.isNullOrBlank() && !gateVisible -> localNotice
                    else -> null
                }
                Spacer(Modifier.height(18.dp))
                Text(
                    text = shownCaption ?: " ",
                    color = Color(0xFF7F858E),
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.widthIn(max = 320.dp)
                )
            }

            if (keyboardOn) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 28.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    BasicTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        textStyle = TextStyle(color = MainText, fontSize = 16.sp),
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(14.dp))
                            .background(SurfaceDark)
                            .border(1.dp, BorderDark, RoundedCornerShape(14.dp))
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        decorationBox = { inner ->
                            if (draft.isEmpty()) Text("Type a message", color = HintText, fontSize = 16.sp)
                            inner()
                        }
                    )
                    Button(
                        onClick = {
                            val text = draft.trim()
                            if (text.isNotEmpty()) {
                                onTextSubmitted(text)
                                draft = ""
                            }
                        },
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MainText, contentColor = Background)
                    ) { Text("Send") }
                }
            }

            // Controls — same as multi-sector MainActivity
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically
            ) {
                VoiceControl(
                    label = if (muted) "Mic off" else "Mic",
                    selected = muted,
                    onClick = {
                        muted = !muted
                        session?.setMuted(muted)
                    },
                    icon = if (muted) Icons.Filled.MicOff else Icons.Filled.Mic
                )
                VoiceControl(
                    label = if (captionsOn) "CC on" else "CC",
                    selected = captionsOn,
                    onClick = { captionsOn = !captionsOn },
                    icon = Icons.Filled.Subtitles
                )
                VoiceControl(
                    label = if (keyboardOn) "Hide keys" else "Keyboard",
                    selected = keyboardOn,
                    onClick = { keyboardOn = !keyboardOn },
                    icon = Icons.Filled.Keyboard
                )
                Button(
                    onClick = {
                        if (!endArmed) {
                            endArmed = true
                        } else {
                            endArmed = false
                            session?.stop()
                            session = null
                            state = VoiceUiState.Ended
                            gateVisible = true
                            localNotice = "Call ended."
                        }
                    },
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (endArmed) Danger else Color(0xFF1F1513),
                        contentColor = if (endArmed) Background else Danger
                    )
                ) {
                    Text(if (endArmed) "Tap to end" else "End", fontWeight = FontWeight.Medium)
                }
            }
        }

        if (gateVisible) {
            Column(
                Modifier
                    .fillMaxSize()
                    .background(Background.copy(alpha = 0.94f))
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 28.dp)
                    .padding(bottom = 100.dp),
                verticalArrangement = Arrangement.Bottom,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                GlVoiceOrb(VoiceUiState.Ready, level = 0f, modifier = Modifier.size(172.dp))
                Spacer(Modifier.height(28.dp))
                Text(
                    if (state == VoiceUiState.Denied) "Microphone access needed" else "Talk, don't type",
                    color = MainText,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.02).sp,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    localNotice
                        ?: "Voice uses your microphone and a secure, short-lived connection. Audio is streamed only while the call is open.",
                    color = HintText,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    modifier = Modifier.fillMaxWidth().widthIn(max = 320.dp)
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "Microphone access is requested only after you tap Start.",
                    color = HintText.copy(alpha = 0.75f),
                    fontSize = 12.sp,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(28.dp))
                Button(
                    onClick = {
                        localNotice = null
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                            PackageManager.PERMISSION_GRANTED
                        ) {
                            gateVisible = false
                            beginVoiceSession(
                                api, context, scope,
                                onSession = { session = it },
                                onState = { state = it },
                                onCaption = { caption = it },
                                onError = { msg -> localNotice = msg; gateVisible = true },
                                onEnded = { session = null; gateVisible = true }
                            )
                        } else {
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MainText, contentColor = Background)
                ) {
                    Text(
                        if (state == VoiceUiState.Denied) "Try again" else "Start",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
private fun GlVoiceOrb(state: VoiceUiState, level: Float, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val orbView = remember {
        OrbSurfaceView(context).apply {
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
        }
    }
    AndroidView(
        factory = { orbView },
        modifier = modifier,
        update = {
            it.setVoiceUiState(state)
            it.setAudioLevel(level)
        }
    )
}

@Composable
private fun VoiceControl(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    icon: ImageVector
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        IconButton(
            onClick = onClick,
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(if (selected) Color(0xFF1E2126) else SurfaceDark)
                .border(1.dp, BorderDark, CircleShape)
        ) {
            Icon(icon, contentDescription = label, tint = if (selected) HintText else MainText)
        }
        Text(label, color = HintText, fontSize = 11.sp)
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
                                onError("Call ended before voice was ready.")
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
            onError(error.message ?: "Could not create a secure voice session.")
        }
    }
}
