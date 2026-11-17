package com.klyntech.nallyhermes.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.klyntech.nallyhermes.MobileApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.min
import kotlin.random.Random

/** Native voice session states — aligned with the voice mini-app mockup. */
enum class VoiceUiState {
    Ready, Connecting, Listening, Thinking, Tool, Speaking, Interrupted, Reconnecting, Denied, Ended
}

// Mockup palette (voice-miniapp-mockup)
private object VoiceTheme {
    val Bg = Color(0xFF0D0E10)
    val Surface = Color(0xFF16181C)
    val Surface2 = Color(0xFF1E2126)
    val Line = Color(0xFF272B31)
    val Text = Color(0xFFECEBE6)
    val Hint = Color(0xFF8A8F98)
    val Agent = Color(0xFFE8B98A) // speaking
    val User = Color(0xFF8FB8D8)  // listening
    val Danger = Color(0xFFE07A6A)
    val Thinking = Color(0xFFA9A4C9)
    val ReadyTint = Color(0xFF5C6470)
    val ReadyHalo = Color(0xFF1B2026)
    val ListenHalo = Color(0xFF14202A)
    val ThinkHalo = Color(0xFF1C1A26)
    val SpeakHalo = Color(0xFF2A2118)
}

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

    // Simulated orb level while listening / speaking (mockup energy)
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

    // Transparent so the shared chat blur / spiderman bg shows through (no solid bleed)
    Box(modifier.fillMaxSize().imePadding()) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(bottom = 72.dp), // room for floating tab pill
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Stage
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = if (keyboardOn) Arrangement.Top else Arrangement.Center
            ) {
                if (keyboardOn) Spacer(Modifier.height(24.dp))

                MockupVoiceOrb(
                    state = state,
                    level = audioLevel,
                    modifier = Modifier.size(if (keyboardOn) 128.dp else 240.dp)
                )

                Spacer(Modifier.height(if (keyboardOn) 20.dp else 40.dp))

                Text(
                    text = statusText,
                    color = if (state == VoiceUiState.Denied) VoiceTheme.Hint else VoiceTheme.Text,
                    fontSize = if (state == VoiceUiState.Denied) 17.sp else 26.sp,
                    fontWeight = if (state == VoiceUiState.Denied) FontWeight.Normal else FontWeight.Medium,
                    letterSpacing = (-0.015).sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .widthIn(max = 300.dp)
                        .padding(horizontal = 8.dp)
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
                    modifier = Modifier
                        .widthIn(max = 320.dp)
                        .alpha(if (shownCaption != null) 1f else 0f)
                        .padding(horizontal = 4.dp)
                )

                if (state == VoiceUiState.Tool || state == VoiceUiState.Thinking) {
                    Spacer(Modifier.height(16.dp))
                    Row(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(VoiceTheme.Surface)
                            .border(1.dp, VoiceTheme.Line, RoundedCornerShape(999.dp))
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(VoiceTheme.Thinking)
                        )
                        Text(
                            if (state == VoiceUiState.Tool) "Using tools…" else "Thinking…",
                            color = VoiceTheme.Text,
                            fontSize = 14.sp
                        )
                    }
                }
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
                        textStyle = TextStyle(color = VoiceTheme.Text, fontSize = 16.sp),
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(14.dp))
                            .background(VoiceTheme.Surface)
                            .border(1.dp, VoiceTheme.Line, RoundedCornerShape(14.dp))
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        decorationBox = { inner ->
                            if (draft.isEmpty()) {
                                Text("Type a message", color = VoiceTheme.Hint, fontSize = 16.sp)
                            }
                            inner()
                        }
                    )
                    Box(
                        Modifier
                            .height(44.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(VoiceTheme.Text)
                            .clickable {
                                val text = draft.trim()
                                if (text.isNotEmpty()) {
                                    onTextSubmitted(text)
                                    draft = ""
                                    localNotice = null
                                }
                            }
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Send", color = VoiceTheme.Bg, fontWeight = FontWeight.Medium, fontSize = 15.sp)
                    }
                }
            }

            // Bottom control bar — exact mockup layout
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(22.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    MockupCtl(
                        pressed = muted,
                        onClick = {
                            muted = !muted
                            session?.setMuted(muted)
                        },
                        label = if (muted) "Mic off" else "Mic"
                    ) { MockupMicIcon(muted) }

                    MockupCtl(
                        pressed = captionsOn,
                        onClick = { captionsOn = !captionsOn },
                        label = if (captionsOn) "CC on" else "CC",
                        emphasizePressed = true
                    ) { MockupCcIcon() }

                    MockupCtl(
                        pressed = keyboardOn,
                        onClick = { keyboardOn = !keyboardOn },
                        label = if (keyboardOn) "Hide keys" else "Keyboard"
                    ) { MockupKeyboardIcon() }

                    // End — mockup pill
                    val endInteraction = remember { MutableInteractionSource() }
                    Box(
                        Modifier
                            .height(56.dp)
                            .clip(RoundedCornerShape(28.dp))
                            .background(if (endArmed) VoiceTheme.Danger else Color.Transparent)
                            .border(
                                1.dp,
                                if (endArmed) VoiceTheme.Danger else Color(0xFF3A2420),
                                RoundedCornerShape(28.dp)
                            )
                            .clickable(interactionSource = endInteraction, indication = null) {
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
                            }
                            .padding(horizontal = 22.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            if (endArmed) "Tap to end" else "End",
                            color = if (endArmed) VoiceTheme.Bg else VoiceTheme.Danger,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        // Start gate — mockup
        if (gateVisible) {
            Column(
                Modifier
                    .fillMaxSize()
                    .background(VoiceTheme.Bg.copy(alpha = 0.92f))
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 28.dp)
                    .padding(bottom = 100.dp),
                verticalArrangement = Arrangement.Bottom
            ) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    MockupVoiceOrb(VoiceUiState.Ready, level = 0f, modifier = Modifier.size(172.dp))
                }
                Spacer(Modifier.height(28.dp))
                Text(
                    if (state == VoiceUiState.Denied) "Microphone access needed" else "Talk, don't type",
                    color = VoiceTheme.Text,
                    fontSize = 26.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.02).sp
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    localNotice
                        ?: "Voice uses your microphone and a secure, short-lived connection. Audio is streamed only while the call is open.",
                    color = VoiceTheme.Hint,
                    fontSize = 16.sp,
                    lineHeight = 24.sp,
                    modifier = Modifier.widthIn(max = 320.dp)
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    "Microphone access is requested only after you tap Start.",
                    color = VoiceTheme.Hint.copy(alpha = 0.75f),
                    fontSize = 12.sp
                )
                Spacer(Modifier.height(28.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(VoiceTheme.Text)
                        .clickable {
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
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        if (state == VoiceUiState.Denied) "Try again" else "Start",
                        color = VoiceTheme.Bg,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
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
                                onError("Call ended before voice was ready. Check the message above for details.")
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

@Composable
private fun MockupCtl(
    pressed: Boolean,
    onClick: () -> Unit,
    label: String,
    emphasizePressed: Boolean = false,
    icon: @Composable () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(
                    when {
                        pressed && emphasizePressed -> VoiceTheme.Surface2
                        else -> VoiceTheme.Surface
                    }
                )
                .border(1.dp, VoiceTheme.Line, CircleShape)
                .clickable(interactionSource = interaction, indication = null, onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.alpha(if (pressed && !emphasizePressed) 0.55f else 1f)) {
                icon()
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(label, color = VoiceTheme.Hint, fontSize = 12.sp)
    }
}

@Composable
private fun MockupMicIcon(muted: Boolean) {
    Canvas(Modifier.size(22.dp)) {
        val s = size.minDimension
        val stroke = Stroke(width = s * 0.08f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val c = VoiceTheme.Text
        // Mic body
        drawRoundRect(
            color = c,
            topLeft = Offset(s * 0.35f, s * 0.12f),
            size = Size(s * 0.30f, s * 0.42f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * 0.15f, s * 0.15f),
            style = stroke
        )
        // Arc under mic
        drawArc(
            color = c,
            startAngle = 20f,
            sweepAngle = 140f,
            useCenter = false,
            topLeft = Offset(s * 0.22f, s * 0.28f),
            size = Size(s * 0.56f, s * 0.50f),
            style = stroke
        )
        // Stem
        drawLine(c, Offset(s * 0.50f, s * 0.72f), Offset(s * 0.50f, s * 0.82f), strokeWidth = s * 0.08f, cap = StrokeCap.Round)
        drawLine(c, Offset(s * 0.34f, s * 0.82f), Offset(s * 0.66f, s * 0.82f), strokeWidth = s * 0.08f, cap = StrokeCap.Round)
        if (muted) {
            drawLine(
                c,
                Offset(s * 0.22f, s * 0.22f),
                Offset(s * 0.78f, s * 0.78f),
                strokeWidth = s * 0.09f,
                cap = StrokeCap.Round
            )
        }
    }
}

@Composable
private fun MockupCcIcon() {
    Canvas(Modifier.size(22.dp)) {
        val s = size.minDimension
        val stroke = Stroke(width = s * 0.08f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val c = VoiceTheme.Text
        drawRoundRect(
            color = c,
            topLeft = Offset(s * 0.08f, s * 0.28f),
            size = Size(s * 0.84f, s * 0.44f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * 0.10f, s * 0.10f),
            style = stroke
        )
        // C C
        drawArc(c, 40f, 280f, false, Offset(s * 0.18f, s * 0.36f), Size(s * 0.28f, s * 0.28f), style = stroke)
        drawArc(c, 40f, 280f, false, Offset(s * 0.52f, s * 0.36f), Size(s * 0.28f, s * 0.28f), style = stroke)
    }
}

@Composable
private fun MockupKeyboardIcon() {
    Canvas(Modifier.size(22.dp)) {
        val s = size.minDimension
        val stroke = Stroke(width = s * 0.07f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val c = VoiceTheme.Text
        drawRoundRect(
            color = c,
            topLeft = Offset(s * 0.08f, s * 0.22f),
            size = Size(s * 0.84f, s * 0.56f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * 0.08f, s * 0.08f),
            style = stroke
        )
        val key = s * 0.08f
        for (row in 0..1) {
            for (col in 0..3) {
                val x = s * 0.20f + col * s * 0.16f
                val y = s * 0.34f + row * s * 0.16f
                drawCircle(c, key * 0.45f, Offset(x, y))
            }
        }
        drawLine(c, Offset(s * 0.28f, s * 0.66f), Offset(s * 0.72f, s * 0.66f), strokeWidth = s * 0.07f, cap = StrokeCap.Round)
    }
}

/**
 * Mockup orb: halo + core + ring with state tints and level-driven scale
 * (CSS orb from voice-miniapp-mockup).
 */
@Composable
private fun MockupVoiceOrb(
    state: VoiceUiState,
    level: Float,
    modifier: Modifier = Modifier
) {
    val infinite = rememberInfiniteTransition(label = "orb")
    val spin by infinite.animateFloat(
        0f, 360f,
        infiniteRepeatable(tween(1200, easing = LinearEasing), RepeatMode.Restart),
        label = "spin"
    )
    val breathe by infinite.animateFloat(
        0.92f, 1f,
        infiniteRepeatable(tween(4500, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breathe"
    )
    val thinkPulse by infinite.animateFloat(
        0.96f, 1.04f,
        infiniteRepeatable(tween(1600, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "think"
    )

    val (tint, halo) = when (state) {
        VoiceUiState.Listening, VoiceUiState.Interrupted -> VoiceTheme.User to VoiceTheme.ListenHalo
        VoiceUiState.Speaking -> VoiceTheme.Agent to VoiceTheme.SpeakHalo
        VoiceUiState.Thinking, VoiceUiState.Tool -> VoiceTheme.Thinking to VoiceTheme.ThinkHalo
        VoiceUiState.Connecting, VoiceUiState.Reconnecting, VoiceUiState.Ready ->
            VoiceTheme.ReadyTint to VoiceTheme.ReadyHalo
        VoiceUiState.Denied, VoiceUiState.Ended -> Color(0xFF3A4048) to Color.Transparent
    }

    val coreScale = when (state) {
        VoiceUiState.Ready, VoiceUiState.Reconnecting -> breathe
        VoiceUiState.Thinking, VoiceUiState.Tool -> thinkPulse
        VoiceUiState.Listening, VoiceUiState.Speaking, VoiceUiState.Interrupted -> 1f + level * 0.22f
        VoiceUiState.Denied, VoiceUiState.Ended -> 0.9f
        else -> 1f
    }
    val ringScale = 1f + level * 0.35f
    val coreAlpha = when (state) {
        VoiceUiState.Denied, VoiceUiState.Ended -> 0.35f
        else -> 1f
    }
    val orbAlpha by animateFloatAsState(
        if (state == VoiceUiState.Ended) 0f else 1f,
        animationSpec = tween(800),
        label = "orbAlpha"
    )

    Box(
        modifier
            .scale(1f)
            .alpha(orbAlpha),
        contentAlignment = Alignment.Center
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val unit = min(size.width, size.height)
            val center = Offset(size.width / 2f, size.height / 2f)

            // Halo
            if (halo != Color.Transparent) {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(halo.copy(alpha = 0.55f), Color.Transparent),
                        center = center,
                        radius = unit * 0.55f
                    ),
                    radius = unit * 0.55f,
                    center = center
                )
            }

            // Ring
            if (state == VoiceUiState.Connecting) {
                rotate(spin, center) {
                    drawCircle(
                        brush = Brush.sweepGradient(
                            colors = listOf(tint, Color.Transparent, Color.Transparent, tint.copy(alpha = 0.3f)),
                            center = center
                        ),
                        radius = unit * 0.42f,
                        center = center,
                        style = Stroke(width = unit * 0.012f)
                    )
                }
            } else {
                drawCircle(
                    color = tint.copy(alpha = 0.40f),
                    radius = unit * 0.42f * ringScale,
                    center = center,
                    style = Stroke(width = unit * 0.008f)
                )
            }

            // Core — radial highlight like mockup
            val coreR = unit * 0.28f * coreScale
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Color.White.copy(alpha = 0.22f),
                        tint.copy(alpha = 0.95f * coreAlpha),
                        tint.copy(alpha = 0.55f * coreAlpha),
                        tint.copy(alpha = 0.25f * coreAlpha)
                    ),
                    center = Offset(center.x - coreR * 0.28f, center.y - coreR * 0.32f),
                    radius = coreR * 2.1f
                ),
                radius = coreR,
                center = center
            )
            // Soft outer glow
            drawCircle(
                color = tint.copy(alpha = 0.18f * coreAlpha),
                radius = coreR * 1.35f,
                center = center
            )
        }
    }
}
