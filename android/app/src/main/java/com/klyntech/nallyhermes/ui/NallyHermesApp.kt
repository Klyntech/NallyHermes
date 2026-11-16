package com.klyntech.nallyhermes.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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

    LaunchedEffect(paired) {
        if (!paired) return@LaunchedEffect
        while (true) {
            try {
                val snapshot = api.fetchMessages(0L)
                if (snapshot.messages != messages.toList()) {
                    messages.clear()
                    messages.addAll(snapshot.messages)
                }
                activity = snapshot.activity
                connectionMessage = null
            } catch (error: Exception) {
                connectionMessage = error.message ?: "Could not sync with Nally."
                if (!api.isPaired) paired = false
            }
            delay(1_500)
        }
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

    Box(Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(R.drawable.spiderman_bg),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background.copy(alpha = 0.82f)))
        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                AnimatedVisibility(
                    visible = paired && !showPairingCode,
                    enter = fadeIn(tween(220)) + slideInVertically(tween(260, easing = FastOutSlowInEasing)) { it / 2 },
                    exit = fadeOut(tween(150)) + slideOutVertically(tween(190)) { it / 3 }
                ) { FloatingNavigation(selectedTab) { selectedTabName = it.name } }
            }
        ) { insets ->
            AnimatedContent(
                targetState = when { paired -> "app"; showPairingCode -> "code"; else -> "login" },
                modifier = Modifier.padding(insets),
                transitionSpec = {
                    (fadeIn(tween(250)) + scaleIn(initialScale = 0.985f, animationSpec = tween(250, easing = FastOutSlowInEasing))) togetherWith fadeOut(tween(160))
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
                        onConnected = { paired = true; showPairingCode = false; authFeedback = null },
                        onBack = { authFeedback = null; showPairingCode = false }
                    )
                    else -> AnimatedContent(
                        targetState = selectedTab,
                        transitionSpec = {
                            val direction = if (targetState.ordinal >= initialState.ordinal) 1 else -1
                            (fadeIn(tween(240)) + slideInHorizontally(
                                animationSpec = tween(270, easing = FastOutSlowInEasing),
                                initialOffsetX = { width -> direction * width / 14 }
                            )) togetherWith (fadeOut(tween(170)) + slideOutHorizontally(
                                animationSpec = tween(230),
                                targetOffsetX = { width -> -direction * width / 18 }
                            ))
                        },
                        label = "tabTransition"
                    ) { tab ->
                        when (tab) {
                            AppTab.CHAT -> ChatScreen(
                                messages = messages,
                                activity = activity,
                                paired = paired,
                                connectionMessage = connectionMessage,
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
                            AppTab.VOICE -> VoiceScreen(onSettings = { selectedTabName = AppTab.SETTINGS.name })
                            AppTab.SETTINGS -> SettingsScreen(
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

@Composable
private fun TelegramLoginScreen(
    busy: Boolean,
    feedback: String?,
    onLogin: () -> Unit,
    onUseCode: () -> Unit
) {
    Box(Modifier.fillMaxSize()) {
        AnimatedLoginBackdrop()
        Column(
            Modifier.fillMaxSize().imePadding().navigationBarsPadding().padding(horizontal = 27.dp, vertical = 22.dp),
            horizontalAlignment = Alignment.Start,
            verticalArrangement = Arrangement.Center
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(48.dp).clip(RoundedCornerShape(17.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                    LucideIcon(LucideR.drawable.lucide_ic_sparkles, null, MaterialTheme.colorScheme.primary, Modifier.size(24.dp))
                }
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text("NallyHermes", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Text("YOUR PERSONAL ASSISTANT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
                }
            }
            Spacer(Modifier.height(48.dp))
            Text("A calmer way\nto think things through.", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(12.dp))
            Text("Sign in with the Telegram account you already use with Nally. Your conversation stays in sync across both apps.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(30.dp))
            val pulse by rememberInfiniteTransition(label = "telegramLoginPill").animateFloat(
                initialValue = 0.992f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(1_900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                label = "telegramLoginPillPulse"
            )
            Row(
                Modifier.fillMaxWidth().height(60.dp).graphicsLayer { scaleX = pulse; scaleY = pulse }
                    .clip(CircleShape)
                    .background(Brush.horizontalGradient(listOf(Color(0xFF218BCB), Color(0xFF1473B8))))
                    .border(1.dp, Color.White.copy(alpha = 0.24f), CircleShape)
                    .clickable(enabled = !busy) { onLogin() }
                    .padding(horizontal = 21.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                LucideIcon(LucideR.drawable.lucide_ic_send, null, Color.White, Modifier.size(20.dp))
                Spacer(Modifier.width(11.dp))
                Text(if (busy) "Preparing secure sign-in…" else "Continue with Telegram", style = MaterialTheme.typography.titleSmall, color = Color.White, fontWeight = FontWeight.SemiBold)
                if (!busy) {
                    Spacer(Modifier.width(9.dp))
                    LucideIcon(LucideR.drawable.lucide_ic_arrow_right, null, Color.White.copy(alpha = 0.9f), Modifier.size(17.dp))
                }
            }
            feedback?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            TextButton(onClick = onUseCode, enabled = !busy, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text("Use a one-time code instead", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(18.dp))
            Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                LucideIcon(LucideR.drawable.lucide_ic_shield_check, null, MaterialTheme.colorScheme.primary, Modifier.size(15.dp))
                Text("Secure sign-in · private chat sync", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun AnimatedLoginBackdrop() {
    val transition = rememberInfiniteTransition(label = "loginBackdrop")
    val drift by transition.animateFloat(-32f, 34f, infiniteRepeatable(tween(7_200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "loginBackdropDrift")
    val glow by transition.animateFloat(0.11f, 0.19f, infiniteRepeatable(tween(3_600), RepeatMode.Reverse), label = "loginBackdropGlow")
    val accent = MaterialTheme.colorScheme.primary
    Canvas(Modifier.fillMaxSize()) {
        val radius = size.minDimension * 0.43f
        val topCenter = Offset(size.width * 0.86f + drift, size.height * 0.18f)
        val lowerCenter = Offset(size.width * 0.06f - drift * 0.65f, size.height * 0.82f)
        drawCircle(Brush.radialGradient(listOf(Color(0xFF3D8CDB).copy(alpha = glow), Color.Transparent), center = topCenter, radius = radius), radius, topCenter)
        drawCircle(Brush.radialGradient(listOf(accent.copy(alpha = glow * 0.72f), Color.Transparent), center = lowerCenter, radius = radius * 0.82f), radius * 0.82f, lowerCenter)
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
    Box(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 18.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(25.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f), RoundedCornerShape(25.dp)).padding(5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AppTab.entries.forEach { tab ->
                val active = selected == tab
                val itemColor by animateColorAsState(if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent, animationSpec = tween(220, easing = FastOutSlowInEasing), label = "navSurface")
                val iconColor by animateColorAsState(if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, animationSpec = tween(180), label = "navIcon")
                Column(
                    Modifier.weight(1f).height(54.dp).clip(RoundedCornerShape(20.dp)).background(itemColor).clickable { onSelect(tab) }.padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    LucideIcon(tab.icon, tab.label, iconColor, Modifier.size(20.dp))
                    Text(tab.label, style = MaterialTheme.typography.labelSmall, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium)
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
    onSend: (String) -> Unit,
    onSettings: () -> Unit,
    onVoice: () -> Unit,
    modifier: Modifier = Modifier
) {
    var draft by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()
    fun send() {
        val text = draft.trim()
        if (text.isNotEmpty() && paired) { onSend(text); draft = "" }
    }

    Column(modifier.fillMaxSize().imePadding()) {
        ChatHeader(onSettings = onSettings)
        Row(Modifier.fillMaxWidth().padding(horizontal = 21.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(if (paired) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error))
            Spacer(Modifier.width(7.dp))
            Text(if (paired) "Synced with Telegram" else "Reconnect Telegram to sync", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (messages.isEmpty()) {
            WelcomeScreen(onPrompt = { draft = it }, modifier = Modifier.weight(1f).fillMaxWidth())
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(), state = listState,
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                items(messages, key = { it.id }) { message ->
                    if (message.role == "user") UserMessage(message.text, message.status) else AssistantMessage(message.text)
                }
                if (activity != null) item(key = "agent-activity") {
                    if (activity.requiresTelegramApproval) NoticeCard("Approval in Telegram", "Open your private NallyHermes Telegram chat to review the requested action.")
                    else AgentActivityCard(AgentActivity(headline = activity.headline, provider = activity.provider, isThinking = activity.isThinking))
                }
                connectionMessage?.let { error -> item(key = "connection-error") { NoticeCard("Sync issue", error) } }
            }
            LaunchedEffect(messages.size, activity, connectionMessage) {
                val last = listState.layoutInfo.totalItemsCount - 1
                if (last >= 0) listState.animateScrollToItem(last)
            }
        }
        MessageComposer(value = draft, onValueChange = { draft = it }, onSend = ::send, onVoice = onVoice, enabled = paired)
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
private fun UserMessage(text: String, status: String) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
private fun AssistantMessage(text: String) {
    Column(Modifier.fillMaxWidth().padding(end = 22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
    Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 13.dp, vertical = 8.dp)) {
        AnimatedVisibility(visible = trayOpen) {
            ToolShortcutTray(onSelect = { prefix -> onValueChange(if (value.isBlank()) prefix else "$value$prefix"); trayOpen = false }, modifier = Modifier.padding(bottom = 8.dp))
        }
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(27.dp)).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.97f))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.66f), RoundedCornerShape(27.dp)).padding(horizontal = 16.dp, vertical = 11.dp)) {
            Box(Modifier.fillMaxWidth().padding(top = 1.dp, bottom = 9.dp)) {
                if (value.isEmpty()) Text(if (enabled) "Message NallyHermes · / for tools" else "Sign in to send a message", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                BasicTextField(value = value, onValueChange = onValueChange, modifier = Modifier.fillMaxWidth(), textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { onSend() }), readOnly = !enabled, maxLines = 5)
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                ComposerIcon(LucideR.drawable.lucide_ic_plus, "Show tools", trayOpen) { trayOpen = !trayOpen }
                Spacer(Modifier.width(8.dp))
                ComposerIcon(LucideR.drawable.lucide_ic_panels_top_left, "Ask Nally to use a tool", false) {
                    val promptStarter = "Use the right available tool to "
                    onValueChange(if (value.isBlank()) promptStarter else "$value$promptStarter")
                }
                Spacer(Modifier.weight(1f))
                ComposerIcon(LucideR.drawable.lucide_ic_mic, "Voice setup", false, onVoice)
                Spacer(Modifier.width(7.dp))
                IconButton(onClick = onSend, enabled = enabled && value.isNotBlank(), modifier = Modifier.size(40.dp).clip(CircleShape).background(if (enabled && value.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)) {
                    LucideIcon(LucideR.drawable.lucide_ic_arrow_up, "Send message", if (enabled && value.isNotBlank()) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(20.dp))
                }
            }
        }
        Text(if (enabled) "Messages sync with your private Telegram chat" else "Sign in to start a synced conversation", Modifier.fillMaxWidth().padding(top = 6.dp, start = 4.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ComposerIcon(icon: Int, description: String, selected: Boolean, onClick: () -> Unit) {
    val tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    IconButton(onClick = onClick, modifier = Modifier.size(36.dp)) { LucideIcon(icon, description, tint, Modifier.size(21.dp)) }
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
