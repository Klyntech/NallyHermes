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
import com.klyntech.nallyhermes.WakeWordService
import com.klyntech.nallyhermes.WakeWordPrefs
import androidx.compose.material.icons.filled.Mic
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material.icons.filled.Brightness6
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
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
import androidx.compose.ui.platform.LocalDensity
import com.composables.icons.lucide.R as LucideR
import com.klyntech.nallyhermes.MobileApi
import com.klyntech.nallyhermes.MobileActivitySnapshot
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.klyntech.nallyhermes.MessageSource
import com.klyntech.nallyhermes.MessageThinking
import com.klyntech.nallyhermes.ThinkingStep
import com.klyntech.nallyhermes.SyncedMessage
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
    val isComplete: Boolean = false,
    val steps: List<ThinkingStep> = emptyList(),
    val elapsedMs: Long = 0L
)

@Composable
fun NallyHermesApp(
    onStartTelegramLogin: (TelegramLoginChallenge) -> Unit,
    loginEvents: StateFlow<TelegramLoginEvent?>,
    onLoginEventConsumed: () -> Unit,
    openVoiceTick: Int = 0
) {
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.CHAT.name) }
    LaunchedEffect(openVoiceTick) {
        if (openVoiceTick > 0) selectedTabName = AppTab.VOICE.name
    }
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
        var attempts = 0
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
                attempts += 1
                // Don't trap the user on the spinner if the session is valid but the network hiccups
                if (!api.isPaired) {
                    paired = false
                    syncReady = false
                    initialDataReady = false
                } else if (attempts >= 3) {
                    initialDataReady = true
                }
            }
            delay(1_500)
        }
    }
    // Leave the spinner once history is loaded. Scroll is applied when Chat is composed —
    // scrollToItem cannot complete while the LazyColumn is off-screen on the sync route.
    LaunchedEffect(paired, initialDataReady, messages.size) {
        if (!paired || !initialDataReady || syncReady) return@LaunchedEffect
        val extra = (if (activity != null) 1 else 0) + (if (connectionMessage != null) 1 else 0)
        val lastIndex = (messages.size + extra - 1).coerceAtLeast(0)
        // Seed list index without waiting on an attached LazyList (avoids infinite suspend)
        chatListState.requestScrollToItem(lastIndex)
        api.markInitialSyncComplete()
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
        val density = LocalDensity.current
        val imeVisible = WindowInsets.ime.getBottom(density) > with(density) { 6.dp.toPx() }

        Scaffold(
            containerColor = Color.Transparent,
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = {
                AnimatedVisibility(
                    visible = paired && syncReady && !showPairingCode && !imeVisible,
                    enter = fadeIn(tween(220, easing = FastOutSlowInEasing)) +
                        slideInVertically(
                            animationSpec = spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow)
                        ) { it / 3 },
                    exit = fadeOut(tween(120)) +
                        slideOutVertically(animationSpec = tween(140, easing = FastOutSlowInEasing)) { it / 4 }
                ) { FloatingNavigation(selectedTab) { selectedTabName = it.name } }
            }
        ) { scaffoldPadding ->
            // Keep chat / composer above the floating nav (Scaffold bottomBar height).
            // When the keyboard is up the nav is hidden, so only IME padding applies.
            val shellModifier = if (imeVisible) {
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .imePadding()
                    .padding(bottom = 8.dp) // slight air above the keyboard
            } else {
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(bottom = scaffoldPadding.calculateBottomPadding())
            }
            AnimatedContent(
                targetState = when {
                    paired && !syncReady && !api.hasCompletedInitialSync -> "sync"
                    paired && !syncReady -> "welcome"
                    paired -> "app"
                    showPairingCode -> "code"
                    else -> "login"
                },
                modifier = shellModifier,
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
                    "welcome" -> WelcomeBackScreen()
                    else -> // Chat stays composed so returning from Voice/Settings is instant.
                    // Voice & Settings are light — they can enter/exit freely.
                    Box(Modifier.fillMaxSize()) {
                        val chatVisible = selectedTab == AppTab.CHAT
                        val chatAlpha by animateFloatAsState(
                            targetValue = if (chatVisible) 1f else 0f,
                            animationSpec = tween(190, easing = FastOutSlowInEasing),
                            label = "chatTabAlpha"
                        )
                        val chatScale by animateFloatAsState(
                            targetValue = if (chatVisible) 1f else 0.992f,
                            animationSpec = tween(220, easing = FastOutSlowInEasing),
                            label = "chatTabScale"
                        )
                        val chatShift by animateFloatAsState(
                            targetValue = if (chatVisible) 0f else -0.018f,
                            animationSpec = tween(190, easing = FastOutSlowInEasing),
                            label = "chatTabShift"
                        )
                        Box(
                            Modifier
                                .fillMaxSize()
                                .zIndex(if (chatVisible) 1f else 0f)
                                .graphicsLayer {
                                    alpha = chatAlpha
                                    scaleX = chatScale
                                    scaleY = chatScale
                                    translationX = size.width * chatShift
                                }
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
                            enter = fadeIn(tween(190, easing = FastOutSlowInEasing)) +
                                scaleIn(initialScale = 0.985f, animationSpec = tween(220, easing = FastOutSlowInEasing)),
                            exit = fadeOut(tween(140, easing = FastOutSlowInEasing)) +
                                scaleOut(targetScale = 0.992f, animationSpec = tween(140, easing = FastOutSlowInEasing)),
                            modifier = Modifier.fillMaxSize().zIndex(if (selectedTab == AppTab.VOICE) 2f else 0f)
                        ) {
                            VoiceScreen(
                                api = api,
                                onSettings = { selectedTabName = AppTab.SETTINGS.name },
                                onTextSubmitted = { text ->
                                    scope.launch {
                                        try {
                                            api.sendMessage(UUID.randomUUID().toString(), text)
                                            connectionMessage = null
                                            selectedTabName = AppTab.CHAT.name
                                        } catch (error: Exception) {
                                            connectionMessage = error.message ?: "Message could not be sent."
                                        }
                                    }
                                }
                            )
                        }

                        androidx.compose.animation.AnimatedVisibility(
                            visible = selectedTab == AppTab.SETTINGS,
                            enter = fadeIn(tween(190, easing = FastOutSlowInEasing)) +
                                scaleIn(initialScale = 0.985f, animationSpec = tween(220, easing = FastOutSlowInEasing)),
                            exit = fadeOut(tween(140, easing = FastOutSlowInEasing)) +
                                scaleOut(targetScale = 0.992f, animationSpec = tween(140, easing = FastOutSlowInEasing)),
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

            Spacer(Modifier.height(22.dp))

            // Divider — continue with
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.weight(1f).height(1.dp).background(Color.White.copy(alpha = 0.08f)))
                Text(
                    "  or continue with  ",
                    style = MaterialTheme.typography.labelSmall,
                    color = muted
                )
                Box(Modifier.weight(1f).height(1.dp).background(Color.White.copy(alpha = 0.08f)))
            }

            Spacer(Modifier.height(16.dp))

            var providerNote by remember { mutableStateOf<String?>(null) }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                LoginProviderChip(
                    label = "Google",
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    onClick = { providerNote = "Google sign-in is coming in a later build." }
                ) {
                    Image(
                        painter = painterResource(R.drawable.ic_google_brand),
                        contentDescription = "Google",
                        modifier = Modifier.size(18.dp)
                    )
                }
                LoginProviderChip(
                    label = "GitHub",
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    onClick = { providerNote = "GitHub sign-in is coming in a later build." }
                ) {
                    Image(
                        painter = painterResource(R.drawable.ic_github_brand),
                        contentDescription = "GitHub",
                        colorFilter = ColorFilter.tint(Color.White),
                        modifier = Modifier.size(18.dp)
                    )
                }
                LoginProviderChip(
                    label = "Email",
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    onClick = { providerNote = "Email sign-in is coming in a later build." }
                ) {
                    Image(
                        painter = painterResource(R.drawable.ic_email_brand),
                        contentDescription = "Email",
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            providerNote?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = soft)
            }

            Spacer(Modifier.height(16.dp))

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
private fun LoginProviderChip(
    label: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    icon: @Composable () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White.copy(alpha = 0.06f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
            .clickable(enabled = enabled, interactionSource = interaction, indication = null, onClick = onClick)
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        icon()
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = Color.White.copy(alpha = 0.88f),
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun WelcomeBackScreen() {
    val lines = listOf("Welcome back", "Let’s get things sorted")
    var phase by remember { mutableStateOf(0) }
    val alpha0 by animateFloatAsState(
        targetValue = if (phase >= 0) 1f else 0f,
        animationSpec = tween(900, easing = FastOutSlowInEasing),
        label = "welcomeLine0"
    )
    val alpha1 by animateFloatAsState(
        targetValue = if (phase >= 1) 1f else 0f,
        animationSpec = tween(900, easing = FastOutSlowInEasing),
        label = "welcomeLine1"
    )
    val rise0 by animateFloatAsState(
        targetValue = if (phase >= 0) 0f else 14f,
        animationSpec = tween(900, easing = FastOutSlowInEasing),
        label = "rise0"
    )
    val rise1 by animateFloatAsState(
        targetValue = if (phase >= 1) 0f else 14f,
        animationSpec = tween(900, easing = FastOutSlowInEasing),
        label = "rise1"
    )
    LaunchedEffect(Unit) {
        phase = 0
        delay(700)
        phase = 1
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
            Text(
                lines[0],
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontSize = 30.sp,
                    letterSpacing = (-0.4).sp
                ),
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.graphicsLayer {
                    this.alpha = alpha0
                    translationY = rise0
                }
            )
            Spacer(Modifier.height(10.dp))
            Text(
                lines[1],
                style = MaterialTheme.typography.titleMedium,
                color = Color(0xFFB8BDB4),
                modifier = Modifier.graphicsLayer {
                    this.alpha = alpha1
                    translationY = rise1
                }
            )
            Spacer(Modifier.height(28.dp))
            WindowsStyleSpinner(Modifier.size(28.dp))
        }
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

    Column(modifier.fillMaxSize()) {
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
                            AssistantMessage(
                                text = message.text,
                                sources = message.sources,
                                thinking = message.thinking
                            )
                        }
                    }
                    if (activity != null) item(key = "agent-activity") {
                        if (activity.requiresTelegramApproval) NoticeCard("Approval in Telegram", "Open your private NallyHermes Telegram chat to review the requested action.")
                        else AgentActivityCard(
                            AgentActivity(
                                headline = activity.headline,
                                provider = activity.provider,
                                isThinking = activity.isThinking,
                                steps = activity.steps,
                                elapsedMs = activity.elapsedMs
                            )
                        )
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
            // First paint after sync: land on the latest message
            LaunchedEffect(Unit) {
                val last = listState.layoutInfo.totalItemsCount - 1
                if (last >= 0) {
                    listState.scrollToItem(last)
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
private fun AssistantMessage(
    text: String,
    sources: List<MessageSource> = emptyList(),
    thinking: MessageThinking? = null,
    modifier: Modifier = Modifier
) {
    val (answerBody, legacySourcesMarkdown) = remember(text) { splitSourcesFooter(text) }
    val structured = sources
    val pageCount = when {
        structured.isNotEmpty() -> structured.size
        legacySourcesMarkdown != null -> legacySourcesMarkdown.lines().count { it.trim().startsWith("-") || it.trim().startsWith("*") }
        else -> 0
    }
    var thinkingOpen by rememberSaveable(text) { mutableStateOf(false) }
    var sourcesOpen by rememberSaveable(text) { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth().padding(end = 22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(20.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                LucideIcon(LucideR.drawable.lucide_ic_sparkles, null, MaterialTheme.colorScheme.primary, Modifier.size(12.dp))
            }
            Text("Nally", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (thinking != null && (thinking.durationMs > 0 || thinking.steps.isNotEmpty())) {
            ThoughtProcessCard(
                durationMs = thinking.durationMs,
                steps = thinking.steps,
                expanded = thinkingOpen,
                onToggle = { thinkingOpen = !thinkingOpen },
                modifier = Modifier.padding(start = 27.dp)
            )
        }
        MarkdownContent(
            markdown = answerBody,
            modifier = Modifier.padding(start = 27.dp),
            textColor = MaterialTheme.colorScheme.onSurface,
            mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (pageCount > 0) {
            SourcesCapsule(
                count = pageCount,
                sources = structured,
                expanded = sourcesOpen,
                onToggle = { sourcesOpen = !sourcesOpen },
                legacyMarkdown = legacySourcesMarkdown,
                modifier = Modifier.padding(start = 27.dp, top = 2.dp)
            )
        }
    }
}

@Composable
private fun ThoughtProcessCard(
    durationMs: Long,
    steps: List<ThinkingStep>,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier
) {
    val seconds = ((durationMs + 500) / 1000).coerceAtLeast(if (durationMs > 0) 1 else 0)
    val interaction = remember { MutableInteractionSource() }
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .clip(RoundedCornerShape(20.dp))
                .clickable(interactionSource = interaction, indication = null, onClick = onToggle)
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            LucideIcon(LucideR.drawable.lucide_ic_sparkles, null, MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(14.dp))
            Text(
                if (seconds > 0) "Thought for ${seconds}s" else "Thought process",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(if (expanded) "▾" else "▸", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
        }
        androidx.compose.animation.AnimatedVisibility(visible = expanded) {
            Column(
                Modifier
                    .padding(top = 4.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.55f))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                steps.forEach { step ->
                    Text("· ${step.text}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (steps.isEmpty()) {
                    Text("Steps were not recorded for this reply.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun SourcesCapsule(
    count: Int,
    sources: List<MessageSource>,
    expanded: Boolean,
    onToggle: () -> Unit,
    legacyMarkdown: String?,
    modifier: Modifier = Modifier
) {
    val interaction = remember { MutableInteractionSource() }
    val label = if (count == 1) "1 source" else "$count pages"
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFF1A1B1A))
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(999.dp))
                .clickable(interactionSource = interaction, indication = null, onClick = onToggle)
                .padding(horizontal = 10.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Real favicons for pages Nally searched / read
            Row(horizontalArrangement = Arrangement.spacedBy((-6).dp)) {
                val hosts = sources.mapNotNull { src ->
                    src.url?.let {
                        try { java.net.URI(it).host?.removePrefix("www.") } catch (_: Exception) { null }
                    }
                }.distinct().take(4)
                if (hosts.isEmpty()) {
                    Box(Modifier.size(18.dp).clip(CircleShape).background(Color(0xFF3B82F6)))
                } else {
                    val ctx = LocalContext.current
                    hosts.forEach { host ->
                        AsyncImage(
                            model = ImageRequest.Builder(ctx)
                                .data("https://www.google.com/s2/favicons?domain=$host&sz=64")
                                .crossfade(true)
                                .build(),
                            contentDescription = host,
                            modifier = Modifier
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(Color(0xFF2A2B2A))
                                .border(1.dp, Color(0xFF1A1B1A), CircleShape)
                        )
                    }
                }
            }
            Text(label, style = MaterialTheme.typography.labelMedium, color = Color(0xFFE8EAE4))
        }
        androidx.compose.animation.AnimatedVisibility(visible = expanded) {
            Column(
                Modifier
                    .padding(top = 8.dp)
                    .clip(RoundedCornerShape(15.dp))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.68f))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.55f), RoundedCornerShape(15.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (sources.isNotEmpty()) {
                    sources.forEach { src ->
                        val line = if (src.url != null) "[${src.title}](${src.url})" else src.title
                        MarkdownContent(
                            markdown = "- $line",
                            modifier = Modifier.fillMaxWidth(),
                            textColor = MaterialTheme.colorScheme.primary,
                            mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else if (legacyMarkdown != null) {
                    MarkdownContent(
                        markdown = legacyMarkdown,
                        modifier = Modifier.fillMaxWidth(),
                        textColor = MaterialTheme.colorScheme.primary,
                        mutedColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

private fun sourceHostColor(host: String, index: Int): Color {
    val palette = listOf(
        Color(0xFF1877F2), // facebook-ish
        Color(0xFFEA4335),
        Color(0xFF34A853),
        Color(0xFF4285F4),
        Color(0xFFA855F7),
        Color(0xFF0EA5E9)
    )
    val h = host.lowercase().hashCode()
    return palette[Math.floorMod(h + index, palette.size)]
}

private fun splitSourcesFooter(markdown: String): Pair<String, String?> {
    val lines = markdown.split('\n')
    val footerIndex = lines.indexOfFirst { it.trim().equals("**Sources**", ignoreCase = true) }
    if (footerIndex < 0) return markdown to null
    val body = lines.take(footerIndex).joinToString("\n").trimEnd()
    val sources = lines.drop(footerIndex + 1).joinToString("\n").trim()
    return body to sources.takeIf { it.isNotEmpty() }
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
    var expanded by rememberSaveable(activity.headline, activity.steps.size) { mutableStateOf(true) }
    val infinite = rememberInfiniteTransition(label = "agentThinking")
    val pulse by infinite.animateFloat(
        initialValue = 0.44f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(850, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "thinkingPulse"
    )
    val seconds = ((activity.elapsedMs + 500) / 1000).coerceAtLeast(if (activity.elapsedMs > 0) 1 else 0)
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier
            .fillMaxWidth()
            .animateContentSize()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.93f))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f), RoundedCornerShape(18.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp)
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(interactionSource = interaction, indication = null) { expanded = !expanded },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = if (activity.isThinking) pulse else 1f)),
                contentAlignment = Alignment.Center
            ) {
                LucideIcon(LucideR.drawable.lucide_ic_sparkles, null, MaterialTheme.colorScheme.primary, Modifier.size(14.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    if (activity.isThinking) {
                        if (seconds > 0) "Thinking · ${seconds}s" else "Thinking…"
                    } else activity.headline,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    activity.headline,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = if (expanded) 3 else 1
                )
            }
            Text(if (expanded) "▾" else "▸", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        androidx.compose.animation.AnimatedVisibility(visible = expanded && activity.steps.isNotEmpty()) {
            Column(
                Modifier.padding(top = 10.dp, start = 4.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                activity.steps.takeLast(12).forEach { step ->
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            Modifier
                                .padding(top = 5.dp)
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.7f))
                        )
                        Text(
                            step.text,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
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
    val glassShape = RoundedCornerShape(28.dp)
    val density = LocalDensity.current
    val imeUp = WindowInsets.ime.getBottom(density) > with(density) { 6.dp.toPx() }
    Column(
        Modifier
            .fillMaxWidth()
            .animateContentSize(animationSpec = spring(dampingRatio = 0.88f, stiffness = Spring.StiffnessMediumLow))
            .padding(
                start = 12.dp,
                end = 12.dp,
                top = if (imeUp) 2.dp else 4.dp,
                bottom = if (imeUp) 6.dp else 2.dp
            )
    ) {
        AnimatedVisibility(
            visible = trayOpen,
            enter = fadeIn(tween(180, easing = FastOutSlowInEasing)) +
                slideInVertically(animationSpec = spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow)) { it / 7 },
            exit = fadeOut(tween(130, easing = FastOutSlowInEasing)) +
                slideOutVertically(animationSpec = tween(150, easing = FastOutSlowInEasing)) { it / 12 }
        ) {
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
                                if (enabled) "Message Nally · / for tools" else "Sign in to send a message",
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
                        val sendBackground by animateColorAsState(
                            targetValue = if (canSend) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                            animationSpec = tween(170, easing = FastOutSlowInEasing),
                            label = "composerSendColor"
                        )
                        val sendScale by animateFloatAsState(
                            targetValue = if (canSend) 1f else 0.94f,
                            animationSpec = spring(dampingRatio = 0.72f, stiffness = 520f),
                            label = "composerSendScale"
                        )
                        val sendInteraction = remember { MutableInteractionSource() }
                        Box(
                            Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(sendBackground)
                                .graphicsLayer { scaleX = sendScale; scaleY = sendScale }
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
    }
}

@Composable
private fun ComposerIcon(icon: Int, description: String, selected: Boolean, onClick: () -> Unit) {
    val tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    val scale by animateFloatAsState(
        targetValue = if (selected) 1.06f else 1f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 520f),
        label = "composerIconScale"
    )
    val rotation by animateFloatAsState(
        targetValue = if (selected) 45f else 0f,
        animationSpec = spring(dampingRatio = 0.78f, stiffness = 460f),
        label = "composerIconRotation"
    )
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
        LucideIcon(
            icon,
            description,
            tint,
            Modifier.size(20.dp).graphicsLayer { scaleX = scale; scaleY = scale; rotationZ = rotation }
        )
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
private fun SettingsScreen(
    api: MobileApi,
    onUnlinked: () -> Unit,
    modifier: Modifier = Modifier
) {
    var busy by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var identities by remember { mutableStateOf<List<MobileApi.LinkedIdentity>>(emptyList()) }
    var appearanceLabel by remember { mutableStateOf("System") }
    var voiceLabel by remember { mutableStateOf("Default") }
    var wakeWordEnabled by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        try { identities = api.listIdentities() } catch (_: Exception) {}
        wakeWordEnabled = WakeWordPrefs.isEnabled(context)
    }

    fun refreshIdentities() {
        scope.launch {
            try { identities = api.listIdentities() }
            catch (error: Exception) { feedback = error.message ?: "Could not refresh linked logins." }
        }
    }

    val googleLinked = identities.any { it.provider == "google" }
    val githubLinked = identities.any { it.provider == "github" }

    Column(
        modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 18.dp).padding(bottom = 100.dp)
    ) {
        Text("Settings", Modifier.padding(top = 22.dp, bottom = 4.dp), style = MaterialTheme.typography.headlineLarge)
        Text("Account, voice, and app preferences.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(22.dp))

        SettingsSectionLabel("App")
        SettingsGroup {
            SettingsNavRow(Icons.Filled.Brightness6, "Appearance", appearanceLabel) {
                appearanceLabel = when (appearanceLabel) { "System" -> "Dark"; "Dark" -> "Light"; else -> "System" }
                feedback = "Theme preference: $appearanceLabel"
            }
            SettingsDivider()
            SettingsNavRow(Icons.Filled.Widgets, "Widget", "Add from home screen") {
                feedback = "Long-press home screen, open Widgets, choose NallyHermes."
            }
            SettingsDivider()
            SettingsNavRow(Icons.Filled.Extension, "Skills", "Agent capabilities") {
                feedback = "Skills catalog will list enabled tools and workflows."
            }
        }

        Spacer(Modifier.height(20.dp))
        SettingsSectionLabel("Nally")
        SettingsGroup {
            SettingsNavRow(Icons.Filled.Hub, "Connectors", "Link external services") {
                feedback = "Connectors will wire Drive, calendar, and more."
            }
        }

        Spacer(Modifier.height(20.dp))
        SettingsSectionLabel("Voice")
        SettingsGroup {
            SettingsNavRow(Icons.Filled.RecordVoiceOver, "Voice", voiceLabel) {
                voiceLabel = if (voiceLabel == "Default") "Aria" else "Default"
                feedback = "Voice persona: $voiceLabel"
            }
            SettingsDivider()
            SettingsNavRow(
                Icons.Filled.Mic,
                "Wake word",
                if (wakeWordEnabled) "On · say Hey Nally" else "Off",
                trailing = if (wakeWordEnabled) "On" else "Off"
            ) {
                val next = !wakeWordEnabled
                wakeWordEnabled = next
                WakeWordPrefs.setEnabled(context, next)
                if (next) {
                    WakeWordService.start(context)
                    feedback = "Wake word on. Say Hey Nally when idle. Paused during live voice calls."
                } else {
                    WakeWordService.stop(context)
                    feedback = "Wake word off."
                }
            }
        }

        Spacer(Modifier.height(20.dp))
        SettingsSectionLabel("Account")
        SettingsGroup {
            SettingsNavRow(Icons.Filled.PhoneAndroid, "Telegram", "Linked · sync both ways") {
                feedback = "Telegram is your primary identity for this device."
            }
            SettingsDivider()
            SettingsNavRow(
                Icons.Filled.Link, "Google",
                identities.firstOrNull { it.provider == "google" }?.email ?: if (googleLinked) "Linked" else "Not linked",
                trailing = if (googleLinked) "Unlink" else "Link"
            ) {
                if (googleLinked) {
                    scope.launch {
                        busy = true; feedback = null
                        try { api.unlinkIdentity("google"); refreshIdentities(); feedback = "Google unlinked." }
                        catch (e: Exception) { feedback = e.message ?: "Could not unlink Google." }
                        finally { busy = false }
                    }
                } else feedback = "Google linking needs Sign-In + backend oauth."
            }
            SettingsDivider()
            SettingsNavRow(
                Icons.Filled.Link, "GitHub",
                identities.firstOrNull { it.provider == "github" }?.displayName
                    ?: identities.firstOrNull { it.provider == "github" }?.email
                    ?: if (githubLinked) "Linked" else "Not linked",
                trailing = if (githubLinked) "Unlink" else "Link"
            ) {
                if (githubLinked) {
                    scope.launch {
                        busy = true; feedback = null
                        try { api.unlinkIdentity("github"); refreshIdentities(); feedback = "GitHub unlinked." }
                        catch (e: Exception) { feedback = e.message ?: "Could not unlink GitHub." }
                        finally { busy = false }
                    }
                } else feedback = "GitHub linking needs OAuth access token."
            }
            SettingsDivider()
            SettingsNavRow(Icons.Filled.Logout, "Unlink this device", "Sign out and clear token", destructive = true) {
                if (busy) return@SettingsNavRow
                scope.launch {
                    busy = true; feedback = null
                    try { api.revoke(); onUnlinked() }
                    catch (e: Exception) { feedback = e.message ?: "Could not unlink." }
                    finally { busy = false }
                }
            }
        }

        feedback?.let {
            Spacer(Modifier.height(14.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Spacer(Modifier.height(20.dp))
        SettingsSectionLabel("About")
        SettingsGroup {
            SettingsNavRow(Icons.Filled.PhoneAndroid, "NallyHermes Android", "Native Compose") {
                feedback = "NallyHermes for Android"
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun SettingsSectionLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 6.dp, bottom = 8.dp, top = 2.dp))
}

@Composable
private fun SettingsGroup(content: @Composable ColumnScope.() -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth(), content = content)
    }
}

@Composable
private fun SettingsDivider() {
    HorizontalDivider(modifier = Modifier.padding(start = 56.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f))
}

@Composable
private fun SettingsNavRow(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    trailing: String? = null,
    destructive: Boolean = false,
    onClick: () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        Modifier.fillMaxWidth().clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            Modifier.size(36.dp).clip(RoundedCornerShape(10.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
            if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!trailing.isNullOrBlank()) {
            Text(trailing, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        } else {
            Icon(Icons.Filled.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f), modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun LinkedLoginRow(
    title: String,
    subtitle: String,
    linked: Boolean,
    enabled: Boolean,
    onLink: () -> Unit,
    onUnlink: () -> Unit
) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = if (linked) onUnlink else onLink, enabled = enabled) {
            Text(if (linked) "Unlink" else "Link")
        }
    }
}
