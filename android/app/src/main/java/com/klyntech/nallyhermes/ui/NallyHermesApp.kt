package com.klyntech.nallyhermes.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.zIndex
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import com.composables.icons.lucide.R as LucideR
import com.klyntech.nallyhermes.MobileApi
import com.klyntech.nallyhermes.SyncedMessage
import com.klyntech.nallyhermes.MobileActivitySnapshot
import com.klyntech.nallyhermes.TelegramLoginChallenge
import com.klyntech.nallyhermes.TelegramLoginEvent
import com.klyntech.nallyhermes.R
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

private enum class AppTab(val label: String, val icon: Int) {
    CHAT("Chat", LucideR.drawable.lucide_ic_message_circle),
    VOICE("Voice", LucideR.drawable.lucide_ic_mic),
    SETTINGS("Settings", LucideR.drawable.lucide_ic_settings_2)
}

private data class AgentActivity(
    val headline: String,
    val detail: String? = null,
    val provider: String? = null,
    val isThinking: Boolean = false,
    val isComplete: Boolean = false
)

@Composable
fun NallyHermesApp(
    onStartTelegramLogin: (TelegramLoginChallenge) -> Unit,
    loginEvents: StateFlow<TelegramLoginEvent?>,
    onLoginEventConsumed: () -> Unit
) {
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.CHAT.name) }
    val selectedTab = AppTab.valueOf(selectedTabName)
    val tabStateHolder = rememberSaveableStateHolder()
    val chatListState = rememberSaveable(saver = LazyListState.Saver) { LazyListState() }
    var chatDraft by rememberSaveable { mutableStateOf("") }
    var syncReady by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val api = remember { MobileApi(context.applicationContext) }
    val messages = remember { mutableStateListOf<SyncedMessage>() }
    var paired by remember { mutableStateOf(api.isPaired) }
    var showPairingCode by rememberSaveable { mutableStateOf(false) }
    var loginNonce by rememberSaveable { mutableStateOf<String?>(null) }
    var authFeedback by rememberSaveable { mutableStateOf<String?>(null) }
    var authBusy by remember { mutableStateOf(false) }
    var activity by remember { mutableStateOf<MobileActivitySnapshot?>(null) }
    var connectionMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    var initialDataReady by remember { mutableStateOf(false) }
    LaunchedEffect(paired) {
        if (!paired) {
            syncReady = false
            initialDataReady = false
            return@LaunchedEffect
        }
        while (true) {
            try {
                val snapshot = api.fetchMessages(0L)
                if (snapshot.messages != messages.toList()) {
                    messages.clear()
                    messages.addAll(snapshot.messages)
                }
                activity = snapshot.activity
                connectionMessage = null
                initialDataReady = true
            } catch (error: Exception) {
                connectionMessage = error.message ?: "Could not sync with Nally."
                if (!api.isPaired) {
                    paired = false
                    syncReady = false
                    initialDataReady = false
                }
            }
            delay(1_500)
        }
    }
    // Keep spinner until history is loaded and the list is pinned to the bottom
    LaunchedEffect(paired, initialDataReady, messages.size, activity, connectionMessage) {
        if (!paired || !initialDataReady || syncReady) return@LaunchedEffect
        val extra = (if (activity != null) 1 else 0) + (if (connectionMessage != null) 1 else 0)
        val lastIndex = (messages.size + extra - 1).coerceAtLeast(0)
        try {
            chatListState.scrollToItem(lastIndex)
        } catch (_: Exception) {
        }
        delay(150)
        try {
            chatListState.scrollToItem(lastIndex)
        } catch (_: Exception) {
        }
        delay(100)
        syncReady = true
    }

    LaunchedEffect(loginEvents) {
        loginEvents.collect { event ->
            if (event == null) return@collect
            when (event) {
                is TelegramLoginEvent.Success -> {
                    val nonce = loginNonce
                    if (nonce.isNullOrBlank()) {
                        authFeedback = "That sign-in has expired. Please start again."
                    } else {
                        authBusy = true
                        try {
                            api.completeTelegramLogin(event.idToken, nonce)
                            paired = true
                            showPairingCode = false
                            loginNonce = null
                            authFeedback = null
                            syncReady = false
                        } catch (error: Exception) {
                            authFeedback = error.message ?: "Telegram sign-in could not be completed."
                        } finally {
                            authBusy = false
                        }
                    }
                }
                is TelegramLoginEvent.Failure -> {
                    loginNonce = null
                    authFeedback = event.message
                }
            }
            onLoginEventConsumed()
        }
    }

    // Auth screens get a solid canvas (no photo bleed at status / nav bars).
    // Paired app keeps the branded background treatment.
    val onAuthSurface = !paired || showPairingCode || !syncReady
    Box(Modifier.fillMaxSize().background(if (onAuthSurface) Color(0xFF0B0C0B) else Color.Transparent)) {
        if (!onAuthSurface) {
            Image(
                painter = painterResource(R.drawable.spiderman_bg),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background.copy(alpha = 0.82f)))
        }
        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                AnimatedVisibility(
                    visible = paired && syncReady && !showPairingCode,
                    enter = fadeIn(tween(280, easing = FastOutSlowInEasing)) +
                        slideInVertically(
                            animationSpec = spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow)
                        ) { it / 3 },
                    exit = fadeOut(tween(160)) +
                        slideOutVertically(animationSpec = tween(200, easing = FastOutSlowInEasing)) { it / 4 }
                ) { FloatingNavigation(selectedTab) { selectedTabName = it.name } }
            }
        ) { insets ->
            AnimatedContent(
                targetState = when {
                    paired && !syncReady -> "sync"
                    paired -> "app"
                    showPairingCode -> "code"
                    else -> "login"
                },
                modifier = Modifier.padding(insets),
                transitionSpec = {
                    // Grok: calm cross-fade, almost no motion
                    (
                        fadeIn(animationSpec = tween(320, easing = FastOutSlowInEasing)) +
                        scaleIn(initialScale = 0.992f, animationSpec = tween(340, easing = FastOutSlowInEasing))
                    ) togetherWith (
                        fadeOut(animationSpec = tween(220, easing = FastOutSlowInEasing)) +
                        scaleOut(targetScale = 0.992f, animationSpec = tween(200, easing = FastOutSlowInEasing))
                    )
                },
                label = "authenticationTransition"
            ) { destination ->
                when (destination) {
                    "login" -> TelegramLoginScreen(
                        busy = authBusy,
                        feedback = authFeedback,
                        onLogin = {
                            scope.launch {
                                authBusy = true
                                authFeedback = null
                                try {
                                    val challenge = api.createTelegramLoginChallenge()
                                    loginNonce = challenge.nonce
                                    onStartTelegramLogin(challenge)
                                } catch (error: Exception) {
                                    authFeedback = error.message ?: "Could not start Telegram Login."
                                } finally {
                                    authBusy = false
                                }
                            }
                        },
                        onUseCode = { authFeedback = null; showPairingCode = true }
                    )
                    "code" -> PairingCodeScreen(
                        api = api,
                        busy = authBusy,
                        feedback = authFeedback,
                        onBusyChange = { authBusy = it },
                        onFeedback = { authFeedback = it },
                        onConnected = {
                            paired = true
                            showPairingCode = false
                            authFeedback = null
                            syncReady = false
                        },
                        onBack = { authFeedback = null; showPairingCode = false }
                    )
                    "sync" -> SyncProgressScreen()
                    else -> // Chat stays composed so returning from Voice/Settings is instant.
                    // Voice & Settings are light — they can enter/exit freely.
                    Box(Modifier.fillMaxSize()) {
                        val chatVisible = selectedTab == AppTab.CHAT
                        Box(
                            Modifier
                                .fillMaxSize()
                                .zIndex(if (chatVisible) 1f else 0f)
                                .graphicsLayer { alpha = if (chatVisible) 1f else 0f }
                        ) {
                            ChatScreen(
                                messages = messages,
                                activity = activity,
                                paired = paired,
                                connectionMessage = connectionMessage,
                                listState = chatListState,
                                draft = chatDraft,
                                onDraftChange = { chatDraft = it },
                                onSend = { text ->
                                    scope.launch {
                                        try {
                                            api.sendMessage(UUID.randomUUID().toString(), text)
                                            connectionMessage = null
                                        } catch (error: Exception) {
                                            connectionMessage = error.message ?: "Message could not be sent."
                                        }
                                    }
                                },
                                onSettings = { selectedTabName = AppTab.SETTINGS.name },
                                onVoice = { selectedTabName = AppTab.VOICE.name }
                            )
                        }

                        androidx.compose.animation.AnimatedVisibility(
                            visible = selectedTab == AppTab.VOICE,
                            enter = fadeIn(tween(160, easing = FastOutSlowInEasing)),
                            exit = fadeOut(tween(120)),
                            modifier = Modifier.fillMaxSize().zIndex(if (selectedTab == AppTab.VOICE) 2f else 0f)
                        ) {
                            VoiceScreen(onSettings = { selectedTabName = AppTab.SETTINGS.name })
                        }

                        androidx.compose.animation.AnimatedVisibility(
                            visible = selectedTab == AppTab.SETTINGS,
                            enter = fadeIn(tween(160, easing = FastOutSlowInEasing)),
                            exit = fadeOut(tween(120)),
                            modifier = Modifier.fillMaxSize().zIndex(if (selectedTab == AppTab.SETTINGS) 2f else 0f)
                        ) {
                            tabStateHolder.SaveableStateProvider(AppTab.SETTINGS.name) {
                                SettingsScreen(
                                    api = api,
                                    onUnlinked = {
                                        paired = false
                                        showPairingCode = false
                                        messages.clear()
                                        activity = null
                                        selectedTabName = AppTab.CHAT.name
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TelegramLoginScreen(
    busy: Boolean,
    feedback: String?,
    onLogin: () -> Unit,
    onUseCode: () -> Unit
) {
    // Spotify/Grok-inspired: immersive near-black, one primary pill, calm hierarchy
    val canvas = Color(0xFF0B0C0B)
    val muted = Color(0xFF9A9E96)
    val soft = Color(0xFFB8BDB4)
    val olive = Color(0xFFA3B18A)
    val oliveDeep = Color(0xFF7D8F69)
    val telegram = Color(0xFF2AABEE)

    // Calm entrance — Claude/Render: content settles in after the field is already alive
    var contentVisible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { contentVisible = true }
    val contentAlpha by animateFloatAsState(
        targetValue = if (contentVisible) 1f else 0f,
        animationSpec = tween(700, easing = FastOutSlowInEasing),
        label = "loginContentAlpha"
    )
    val contentRise by animateFloatAsState(
        targetValue = if (contentVisible) 0f else 18f,
        animationSpec = tween(750, easing = FastOutSlowInEasing),
        label = "loginContentRise"
    )

    Box(Modifier.fillMaxSize().background(canvas)) {
        PolishedLoginBackdrop()
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 28.dp)
                .graphicsLayer {
                    alpha = contentAlpha
                    translationY = contentRise
                }
        ) {
            Spacer(Modifier.height(28.dp))
            // Brand mark — quiet, top-left like Spotify / Grok accounts
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(11.dp))
                        .background(olive.copy(alpha = 0.18f))
                        .border(1.dp, olive.copy(alpha = 0.28f), RoundedCornerShape(11.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    LucideIcon(LucideR.drawable.lucide_ic_sparkles, null, olive, Modifier.size(18.dp))
                }
                Text(
                    "NallyHermes",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(Modifier.weight(1f))

            // Hero copy — large, confident, Grok-clean
            Text(
                "Think clearly.\nAct with Nally.",
                style = MaterialTheme.typography.displayMedium.copy(
                    fontSize = 34.sp,
                    lineHeight = 40.sp,
                    letterSpacing = (-0.8).sp,
                    fontWeight = FontWeight.SemiBold
                ),
                color = Color.White
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "Sign in with the Telegram account you already use with Nally. Your private chat stays in sync.",
                style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 24.sp),
                color = muted
            )

            Spacer(Modifier.height(36.dp))

            // Primary CTA — full pill, Spotify-weight
            val pressScale by animateFloatAsState(
                targetValue = if (busy) 0.98f else 1f,
                animationSpec = tween(180, easing = FastOutSlowInEasing),
                label = "loginCtaScale"
            )
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .graphicsLayer { scaleX = pressScale; scaleY = pressScale }
                    .clip(CircleShape)
                    .background(
                        Brush.horizontalGradient(listOf(telegram, Color(0xFF1B92D1)))
                    )
                    .clickable(enabled = !busy, onClick = onLogin),
                contentAlignment = Alignment.Center
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    LucideIcon(LucideR.drawable.lucide_ic_send, null, Color.White, Modifier.size(18.dp))
                    Text(
                        if (busy) "Connecting…" else "Continue with Telegram",
                        style = MaterialTheme.typography.titleSmall,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            feedback?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = Color(0xFFFF8A80))
            }

            Spacer(Modifier.height(18.dp))

            // Secondary — quiet text, not a competing button
            Text(
                "Use a one-time code instead",
                style = MaterialTheme.typography.bodyMedium,
                color = soft,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(enabled = !busy, onClick = onUseCode)
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            )

            Spacer(Modifier.height(28.dp))

            // Trust strip
            Row(
                Modifier.align(Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                LucideIcon(LucideR.drawable.lucide_ic_shield_check, null, oliveDeep, Modifier.size(14.dp))
                Text(
                    "Secure · private · synced with Telegram",
                    style = MaterialTheme.typography.labelSmall,
                    color = muted.copy(alpha = 0.85f)
                )
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}

@Composable
private fun PolishedLoginBackdrop() {
    // Render / Claude style: slow floating color fields, never busy
    val transition = rememberInfiniteTransition(label = "loginAtmosphere")

    val driftA by transition.animateFloat(
        initialValue = -0.04f,
        targetValue = 0.05f,
        animationSpec = infiniteRepeatable(tween(14_000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "driftA"
    )
    val driftB by transition.animateFloat(
        initialValue = 0.05f,
        targetValue = -0.04f,
        animationSpec = infiniteRepeatable(tween(18_000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "driftB"
    )
    val driftC by transition.animateFloat(
        initialValue = -0.03f,
        targetValue = 0.04f,
        animationSpec = infiniteRepeatable(tween(22_000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "driftC"
    )
    val breathe by transition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(8_000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breathe"
    )
    val sweep by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(48_000, easing = LinearEasing), RepeatMode.Restart),
        label = "sweep"
    )

    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height

        // Base vignette — keeps edges dark like Claude's login shell
        drawRect(
            Brush.radialGradient(
                colors = listOf(Color(0xFF141612), Color(0xFF0B0C0B)),
                center = Offset(w * 0.5f, h * 0.42f),
                radius = maxOf(w, h) * 0.85f
            )
        )

        // Soft mesh blobs — olive / teal / telegram blue at very low alpha
        val blob1 = Offset(w * (0.72f + driftA), h * (0.22f + driftB * 0.4f))
        val blob2 = Offset(w * (0.18f + driftB), h * (0.58f + driftA * 0.5f))
        val blob3 = Offset(w * (0.55f + driftC), h * (0.72f + driftB * 0.3f))
        val blob4 = Offset(w * (0.88f + driftA * 0.5f), h * (0.55f + driftC))

        fun softBlob(center: Offset, color: Color, radiusFrac: Float, alpha: Float) {
            val r = w * radiusFrac
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(color.copy(alpha = alpha), Color.Transparent),
                    center = center,
                    radius = r
                ),
                radius = r,
                center = center
            )
        }

        softBlob(blob1, Color(0xFF2AABEE), 0.55f, 0.10f * breathe)
        softBlob(blob2, Color(0xFFA3B18A), 0.50f, 0.11f * breathe)
        softBlob(blob3, Color(0xFF588157), 0.42f, 0.08f * breathe)
        softBlob(blob4, Color(0xFF3D8CDB), 0.36f, 0.07f * (1.2f - breathe * 0.4f))

        // Ultra-slow rotating sheen — almost imperceptible depth
        val angle = Math.toRadians(sweep.toDouble())
        val sheenCenter = Offset(
            (w * 0.5f + kotlin.math.cos(angle).toFloat() * w * 0.18f),
            (h * 0.4f + kotlin.math.sin(angle).toFloat() * h * 0.12f)
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color.White.copy(alpha = 0.025f * breathe), Color.Transparent),
                center = sheenCenter,
                radius = w * 0.35f
            ),
            radius = w * 0.35f,
            center = sheenCenter
        )
    }
}

@Composable
private fun SyncProgressScreen() {
    val lines = remember {
        listOf(
            "Syncing in progress…",
            "This will only take a minute.",
            "Linking your private Telegram chat…",
            "Pulling your latest messages…",
            "Almost there — setting things up.",
            "Securing your session…",
            "Warming up Nally for you…",
            "Hang tight — sync is underway."
        )
    }
    var lineIndex by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(2_800)
            lineIndex = (lineIndex + 1) % lines.size
        }
    }
    val headline = lines[lineIndex]
    val sub = remember(lineIndex) {
        listOf(
            "We’re matching this device with your NallyHermes Telegram chat.",
            "Messages will appear here the moment sync finishes.",
            "You can leave this screen open — we’ll move you to chat automatically.",
            "Private, secure, and tied to the same chat you already use."
        )[lineIndex % 4]
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0B0C0B)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 36.dp)
        ) {
            WindowsStyleSpinner(Modifier.size(56.dp))
            Spacer(Modifier.height(28.dp))
            Text(
                headline,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(Modifier.height(10.dp))
            Text(
                sub,
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFF9A9E96),
                modifier = Modifier.padding(horizontal = 8.dp)
            )
            Spacer(Modifier.height(28.dp))
            Text(
                "Please keep the app open",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFF7A7E76)
            )
        }
    }
}

@Composable
private fun WindowsStyleSpinner(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "winSpinner")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1_050, easing = LinearEasing), RepeatMode.Restart),
        label = "spin"
    )
    val accent = MaterialTheme.colorScheme.primary
    Canvas(modifier) {
        val stroke = size.minDimension * 0.09f
        val inset = stroke / 2f
        // Track
        drawArc(
            color = Color.White.copy(alpha = 0.10f),
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(size.width - stroke, size.height - stroke),
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
        // Active arc — Windows 11 style short leading segment
        drawArc(
            color = accent,
            startAngle = rotation,
            sweepAngle = 88f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(size.width - stroke, size.height - stroke),
            style = Stroke(width = stroke, cap = StrokeCap.Round)
        )
        // Soft trailing hint
        drawArc(
            color = accent.copy(alpha = 0.28f),
            startAngle = rotation - 42f,
            sweepAngle = 36f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = Size(size.width - stroke, size.height - stroke),
            style = Stroke(width = stroke * 0.85f, cap = StrokeCap.Round)
        )
    }
}

@Composable
private fun PairingCodeScreen(
    api: MobileApi,
    busy: Boolean,
    feedback: String?,
    onBusyChange: (Boolean) -> Unit,
    onFeedback: (String?) -> Unit,
    onConnected: () -> Unit,
    onBack: () -> Unit
) {
    var pairingCode by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize().imePadding().navigationBarsPadding().padding(horizontal = 25.dp, vertical = 22.dp),
        verticalArrangement = Arrangement.Center
    ) {
        TextButton(onClick = onBack) { Text("‹  Back to sign in") }
        Spacer(Modifier.height(15.dp))
        Text("Connect your\nTelegram chat", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(10.dp))
        Text("In your private NallyHermes Telegram chat, send /mobile. Enter the one-time code here within five minutes.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(23.dp))
        OutlinedTextField(
            value = pairingCode,
            onValueChange = { pairingCode = it.filter(Char::isDigit).take(10) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("10-digit code") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done)
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                scope.launch {
                    onBusyChange(true)
                    onFeedback(null)
                    try {
                        api.pair(pairingCode)
                        pairingCode = ""
                        onConnected()
                    } catch (error: Exception) {
                        onFeedback(error.message ?: "Pairing could not be completed. Please try again.")
                    } finally {
                        onBusyChange(false)
                    }
                }
            },
            enabled = pairingCode.length == 10 && !busy,
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) { Text(if (busy) "Connecting…" else "Connect securely") }
        feedback?.let {
            Spacer(Modifier.height(11.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(13.dp))
        Text("The code is single-use. Your messages will sync with the same private chat.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LucideIcon(resourceId: Int, description: String?, tint: Color, modifier: Modifier = Modifier) {
    Image(painter = painterResource(resourceId), contentDescription = description, colorFilter = ColorFilter.tint(tint), modifier = modifier)
}

@Composable
private fun BrandIcon(provider: String, modifier: Modifier = Modifier) {
    val resource = when (provider.lowercase()) {
        "github" -> R.drawable.ic_github_brand
        "notion" -> R.drawable.ic_notion_brand
        "gmail" -> R.drawable.ic_gmail_brand
        else -> LucideR.drawable.lucide_ic_sparkles
    }
    Image(painter = painterResource(resource), contentDescription = provider, colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurface), modifier = modifier)
}

@Composable
private fun FloatingNavigation(selected: AppTab, onSelect: (AppTab) -> Unit) {
    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 28.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        val tabs = AppTab.entries
        val trackWidth = maxWidth
        val tabWidth = trackWidth / tabs.size
        val indicatorOffset by animateDpAsState(
            targetValue = tabWidth * selected.ordinal,
            animationSpec = spring(dampingRatio = 0.84f, stiffness = 420f),
            label = "navPillOffset"
        )
        val glassShape = RoundedCornerShape(22.dp)
        val activeShape = RoundedCornerShape(16.dp)

        Box(
            Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(glassShape)
                // Glass base
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.White.copy(alpha = 0.10f),
                            Color.White.copy(alpha = 0.04f),
                            Color.Black.copy(alpha = 0.28f)
                        )
                    )
                )
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.55f))
                .border(
                    width = 1.dp,
                    brush = Brush.verticalGradient(
                        listOf(
                            Color.White.copy(alpha = 0.28f),
                            Color.White.copy(alpha = 0.06f),
                            Color.Black.copy(alpha = 0.18f)
                        )
                    ),
                    shape = glassShape
                )
        ) {
            // Fine grain texture
            Canvas(Modifier.fillMaxSize()) {
                val step = 3.2f
                var y = 0f
                var row = 0
                while (y < size.height) {
                    var x = if (row % 2 == 0) 0f else step * 0.5f
                    while (x < size.width) {
                        val n = ((x * 12.9898f + y * 78.233f) % 1f)
                        val a = if (n > 0.72f) 0.045f else 0.018f
                        drawCircle(
                            color = Color.White.copy(alpha = a),
                            radius = 0.55f,
                            center = Offset(x, y)
                        )
                        x += step
                    }
                    y += step
                    row++
                }
            }

            // Sliding active segment
            Box(
                Modifier
                    .offset(x = indicatorOffset)
                    .width(tabWidth)
                    .fillMaxHeight()
                    .padding(horizontal = 4.dp, vertical = 4.dp)
                    .clip(activeShape)
                    .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.92f))
                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.18f), activeShape)
            )

            Row(
                Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                tabs.forEach { tab ->
                    val active = selected == tab
                    val iconColor by animateColorAsState(
                        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f),
                        animationSpec = tween(180, easing = FastOutSlowInEasing),
                        label = "navIcon"
                    )
                    val labelColor by animateColorAsState(
                        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                        animationSpec = tween(180, easing = FastOutSlowInEasing),
                        label = "navLabel"
                    )
                    val scale by animateFloatAsState(
                        targetValue = if (active) 1.04f else 1f,
                        animationSpec = spring(dampingRatio = 0.75f, stiffness = 480f),
                        label = "navIconScale"
                    )
                    val interaction = remember { MutableInteractionSource() }
                    Column(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clickable(
                                interactionSource = interaction,
                                indication = null
                            ) { onSelect(tab) },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        LucideIcon(
                            tab.icon,
                            tab.label,
                            iconColor,
                            Modifier
                                .size(18.dp)
                                .graphicsLayer { scaleX = scale; scaleY = scale }
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            tab.label,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, lineHeight = 13.sp),
                            color = labelColor,
                            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatScreen(
    messages: List<SyncedMessage>,
    activity: MobileActivitySnapshot?,
    paired: Boolean,
    connectionMessage: String?,
    listState: LazyListState,
    draft: String,
    onDraftChange: (String) -> Unit,
    onSend: (String) -> Unit,
    onSettings: () -> Unit,
    onVoice: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    fun send() {
        val text = draft.trim()
        if (text.isNotEmpty() && paired) {
            onSend(text)
            onDraftChange("")
            scope.launch {
                val last = listState.layoutInfo.totalItemsCount - 1
                if (last >= 0) listState.animateScrollToItem(last)
            }
        }
    }

    val isAtBottom by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            if (info.totalItemsCount == 0) true
            else {
                val lastVisible = info.visibleItemsInfo.lastOrNull()?.index ?: 0
                lastVisible >= info.totalItemsCount - 2
            }
        }
    }

    Column(modifier.fillMaxSize().imePadding()) {
        ChatHeader(onSettings = onSettings)
        Row(Modifier.fillMaxWidth().padding(horizontal = 21.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(if (paired) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error))
            Spacer(Modifier.width(7.dp))
            Text(if (paired) "Synced with Telegram" else "Reconnect Telegram to sync", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (messages.isEmpty()) {
            WelcomeScreen(onPrompt = { onDraftChange(it) }, modifier = Modifier.weight(1f).fillMaxWidth())
        } else {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    state = listState,
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    items(messages, key = { it.id }) { message ->
                        if (message.role == "user") {
                            UserMessage(message.text, message.status)
                        } else {
                            AssistantMessage(message.text)
                        }
                    }
                    if (activity != null) item(key = "agent-activity") {
                        if (activity.requiresTelegramApproval) NoticeCard("Approval in Telegram", "Open your private NallyHermes Telegram chat to review the requested action.")
                        else AgentActivityCard(AgentActivity(headline = activity.headline, provider = activity.provider, isThinking = activity.isThinking))
                    }
                    connectionMessage?.let { error -> item(key = "connection-error") { NoticeCard("Sync issue", error) } }
                }

                // Jump-to-bottom — only when user has scrolled up
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 16.dp, bottom = 12.dp)
                ) {
                    androidx.compose.animation.AnimatedVisibility(
                        visible = !isAtBottom,
                        enter = fadeIn(tween(180)) + scaleIn(initialScale = 0.85f, animationSpec = tween(200)),
                        exit = fadeOut(tween(140)) + scaleOut(targetScale = 0.85f, animationSpec = tween(140))
                    ) {
                        Box(
                            Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
                                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.75f), CircleShape)
                                .clickable {
                                    scope.launch {
                                        val last = listState.layoutInfo.totalItemsCount - 1
                                        if (last >= 0) listState.animateScrollToItem(last)
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            LucideIcon(
                                LucideR.drawable.lucide_ic_chevron_down,
                                "Jump to latest",
                                MaterialTheme.colorScheme.onSurfaceVariant,
                                Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
            // Auto-follow new messages only if already near the bottom
            LaunchedEffect(messages.size, activity, connectionMessage) {
                if (!isAtBottom) return@LaunchedEffect
                val last = listState.layoutInfo.totalItemsCount - 1
                if (last >= 0) listState.animateScrollToItem(last)
            }
        }
        MessageComposer(value = draft, onValueChange = onDraftChange, onSend = ::send, onVoice = onVoice, enabled = paired)
    }
}

@Composable
private fun ChatHeader(onSettings: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 14.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("NallyHermes", style = MaterialTheme.typography.titleLarge)
            Text("YOUR PERSONAL ASSISTANT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        }
        IconAction(LucideR.drawable.lucide_ic_settings_2, "Settings", onSettings)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f))
}

@Composable
private fun IconAction(icon: Int, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick) { LucideIcon(icon, label, MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(21.dp)) }
}

@Composable
private fun WelcomeScreen(onPrompt: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.padding(horizontal = 24.dp), verticalArrangement = Arrangement.Center) {
        Text("A calmer space\nto think things through.", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(10.dp))
        Text("Ask Nally to help with a question, an idea, or what comes next.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(28.dp))
        Text("A PLACE TO START", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        Spacer(Modifier.height(9.dp))
        listOf("Help me plan my day", "Think through a business idea", "Summarize a document").forEach { prompt ->
            Surface(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onPrompt(prompt) }, color = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f), shape = RoundedCornerShape(15.dp)) {
                Row(Modifier.padding(horizontal = 15.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(prompt, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    LucideIcon(LucideR.drawable.lucide_ic_arrow_up_right, null, MaterialTheme.colorScheme.primary, Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
private fun UserMessage(text: String, status: String?, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Surface(color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.98f), shape = RoundedCornerShape(21.dp, 21.dp, 7.dp, 21.dp)) {
            Text(text, Modifier.padding(horizontal = 17.dp, vertical = 12.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
        if (status != "complete") Text(
            when (status) { "awaiting_approval" -> "Waiting for approval in Telegram"; "failed" -> "Not processed · check connection and try again"; else -> "Sent · Nally is working" },
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun AssistantMessage(text: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().padding(end = 22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(20.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                LucideIcon(LucideR.drawable.lucide_ic_sparkles, null, MaterialTheme.colorScheme.primary, Modifier.size(12.dp))
            }
            Text("Nally", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        MarkdownContent(
            markdown = text,
            modifier = Modifier.padding(start = 27.dp),
            textColor = MaterialTheme.colorScheme.onSurface,
            mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun NoticeCard(title: String, message: String) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)).padding(14.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LucideIcon(LucideR.drawable.lucide_ic_circle_alert, null, MaterialTheme.colorScheme.primary, Modifier.size(18.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AgentActivityCard(activity: AgentActivity, modifier: Modifier = Modifier) {
    val infinite = rememberInfiniteTransition(label = "agentThinking")
    val pulse by infinite.animateFloat(initialValue = 0.44f, targetValue = 1f, animationSpec = infiniteRepeatable(tween(850, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "thinkingPulse")
    val scale by animateFloatAsState(if (activity.isThinking && !activity.isComplete) pulse else 1f, label = "activityIcon")
    Row(modifier.fillMaxWidth().animateContentSize().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.93f))
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f), RoundedCornerShape(18.dp)).padding(horizontal = 13.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = scale)), contentAlignment = Alignment.Center) {
            if (activity.provider != null) BrandIcon(activity.provider, Modifier.size(17.dp))
            else LucideIcon(if (activity.isComplete) LucideR.drawable.lucide_ic_circle_check else LucideR.drawable.lucide_ic_sparkles, null, MaterialTheme.colorScheme.primary.copy(alpha = scale), Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(activity.headline, style = MaterialTheme.typography.labelLarge)
            activity.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        if (activity.isThinking && !activity.isComplete) ThinkingDots()
        else if (activity.isComplete) LucideIcon(LucideR.drawable.lucide_ic_circle_check, "Complete", MaterialTheme.colorScheme.primary, Modifier.size(18.dp))
    }
}

@Composable
private fun ThinkingDots() {
    val transition = rememberInfiniteTransition(label = "thinkingDots")
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(3) { index ->
            val alpha by transition.animateFloat(initialValue = 0.28f, targetValue = 1f,
                animationSpec = infiniteRepeatable(animation = tween(620, delayMillis = index * 150, easing = FastOutSlowInEasing), repeatMode = RepeatMode.Reverse), label = "thinkingDot$index")
            Box(Modifier.size(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = alpha)))
        }
    }
}

@Composable
private fun MessageComposer(value: String, onValueChange: (String) -> Unit, onSend: () -> Unit, onVoice: () -> Unit, enabled: Boolean) {
    var trayOpen by rememberSaveable { mutableStateOf(false) }
    val glassShape = RoundedCornerShape(26.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(start = 14.dp, end = 14.dp, top = 4.dp, bottom = 2.dp)
    ) {
        AnimatedVisibility(visible = trayOpen) {
            ToolShortcutTray(
                onSelect = { prefix ->
                    onValueChange(if (value.isBlank()) prefix else "$value$prefix")
                    trayOpen = false
                },
                modifier = Modifier.padding(bottom = 8.dp)
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(glassShape)
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.White.copy(alpha = 0.10f),
                            Color.White.copy(alpha = 0.04f),
                            Color.Black.copy(alpha = 0.22f)
                        )
                    )
                )
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.55f))
                .border(
                    width = 1.dp,
                    brush = Brush.verticalGradient(
                        listOf(
                            Color.White.copy(alpha = 0.26f),
                            Color.White.copy(alpha = 0.06f),
                            Color.Black.copy(alpha = 0.16f)
                        )
                    ),
                    shape = glassShape
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            // Subtle grain
            Box {
                Canvas(Modifier.matchParentSize()) {
                    val step = 3.4f
                    var y = 0f
                    var row = 0
                    while (y < size.height) {
                        var x = if (row % 2 == 0) 0f else step * 0.5f
                        while (x < size.width) {
                            val n = (x * 12.9898f + y * 78.233f) % 1f
                            drawCircle(
                                color = Color.White.copy(alpha = if (n > 0.74f) 0.04f else 0.015f),
                                radius = 0.5f,
                                center = Offset(x, y)
                            )
                            x += step
                        }
                        y += step
                        row++
                    }
                }
                Column {
                    Box(Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 8.dp)) {
                        if (value.isEmpty()) {
                            Text(
                                if (enabled) "Message NallyHermes · / for tools" else "Sign in to send a message",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        BasicTextField(
                            value = value,
                            onValueChange = onValueChange,
                            modifier = Modifier.fillMaxWidth(),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Text,
                                imeAction = ImeAction.Default
                            ),
                            readOnly = !enabled,
                            maxLines = 8
                        )
                    }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        ComposerIcon(LucideR.drawable.lucide_ic_plus, "Show tools", trayOpen) { trayOpen = !trayOpen }
                        Spacer(Modifier.weight(1f))
                        ComposerIcon(LucideR.drawable.lucide_ic_mic, "Voice setup", false, onVoice)
                        Spacer(Modifier.width(6.dp))
                        val canSend = enabled && value.isNotBlank()
                        val sendInteraction = remember { MutableInteractionSource() }
                        Box(
                            Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(
                                    if (canSend) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                                )
                                .clickable(
                                    enabled = canSend,
                                    interactionSource = sendInteraction,
                                    indication = null
                                ) { onSend() },
                            contentAlignment = Alignment.Center
                        ) {
                            LucideIcon(
                                LucideR.drawable.lucide_ic_arrow_up,
                                "Send message",
                                if (canSend) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(
            "Messages sync with your private Telegram chat",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
            modifier = Modifier.padding(horizontal = 6.dp)
        )
    }
}

@Composable
private fun ComposerIcon(icon: Int, description: String, selected: Boolean, onClick: () -> Unit) {
    val tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .size(36.dp)
            .clip(CircleShape)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        LucideIcon(icon, description, tint, Modifier.size(20.dp))
    }
}


@Composable
private fun ToolShortcutTray(onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.97f))
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.58f), RoundedCornerShape(20.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Text("ADD A TOOL TO YOUR PROMPT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.8.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("GitHub", "Notion", "Gmail").forEach { provider ->
                Surface(modifier = Modifier.weight(1f).clickable { onSelect("Use $provider to ") }, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.74f), shape = RoundedCornerShape(14.dp)) {
                    Row(Modifier.padding(horizontal = 9.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        BrandIcon(provider, Modifier.size(16.dp)); Text(provider, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Web search" to "Search the web for ", "Calendar" to "Check my calendar for ", "Memory" to "Recall what you know about ").forEach { (label, prefix) ->
                Surface(modifier = Modifier.weight(1f).clickable { onSelect(prefix) }, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.74f), shape = RoundedCornerShape(14.dp)) {
                    Text(label, Modifier.padding(horizontal = 8.dp, vertical = 10.dp), style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
        Text("Adds a prompt starter; tools run only when Nally receives your request.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun VoiceScreen(onSettings: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Column(Modifier.fillMaxWidth().padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Voice", style = MaterialTheme.typography.headlineLarge)
            Text("A quieter way to talk things through.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.weight(1f))
        Box(Modifier.size(224.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.72f)).border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f), CircleShape), contentAlignment = Alignment.Center) {
            Box(Modifier.size(154.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.96f)), contentAlignment = Alignment.Center) {
                LucideIcon(LucideR.drawable.lucide_ic_mic, "Voice", MaterialTheme.colorScheme.primary, Modifier.size(48.dp))
            }
        }
        Spacer(Modifier.height(27.dp))
        Text("Voice is waiting for setup", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(7.dp))
        Text("Voice is still being prepared for this native client. Your live, synced text conversation is ready in Chat.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onSettings) { Text("View account settings") }
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun SettingsScreen(
    api: MobileApi,
    onUnlinked: () -> Unit,
    modifier: Modifier = Modifier
) {
    var busy by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(modifier.fillMaxSize().padding(horizontal = 22.dp)) {
        Text("Settings", Modifier.padding(top = 26.dp, bottom = 5.dp), style = MaterialTheme.typography.headlineLarge)
        Text("Your Nally account and connected device.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(17.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LucideIcon(LucideR.drawable.lucide_ic_circle_check, null, MaterialTheme.colorScheme.primary, Modifier.size(20.dp))
                    Column {
                        Text("Telegram account", style = MaterialTheme.typography.titleMedium)
                        Text("Linked · messages sync both ways", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
                Text("Messages from Telegram and this app appear in the same private conversation.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = {
                    scope.launch {
                        busy = true
                        feedback = null
                        try { api.revoke(); onUnlinked() }
                        catch (error: Exception) { feedback = error.message ?: "Could not unlink this device." }
                        finally { busy = false }
                    }
                }, enabled = !busy) { Text(if (busy) "Unlinking…" else "Unlink this device") }
                feedback?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        Spacer(Modifier.height(12.dp))
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f), shape = RoundedCornerShape(18.dp)) {
            Row(Modifier.fillMaxWidth().padding(17.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                LucideIcon(LucideR.drawable.lucide_ic_smartphone, null, MaterialTheme.colorScheme.primary, Modifier.size(20.dp))
                Column {
                    Text("NallyHermes Android", style = MaterialTheme.typography.titleSmall)
                    Text("Native Compose · secure token stored on device", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}