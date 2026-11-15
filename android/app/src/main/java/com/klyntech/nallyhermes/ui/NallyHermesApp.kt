package com.klyntech.nallyhermes.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Image
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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.composables.icons.lucide.R as LucideR
import com.klyntech.nallyhermes.R

private enum class AppTab(val label: String, val icon: Int) {
    CHAT("Chat", LucideR.drawable.lucide_ic_message_circle),
    VOICE("Voice", LucideR.drawable.lucide_ic_mic),
    SETTINGS("Settings", LucideR.drawable.lucide_ic_settings_2)
}

private data class ChatMessage(val id: Long, val text: String)

/** UI contract for the future native progress stream; populated only by real server events. */
internal data class AgentActivity(
    val headline: String,
    val detail: String? = null,
    val provider: String? = null,
    val isThinking: Boolean = false,
    val isComplete: Boolean = false
)

@Composable
fun NallyHermesApp() {
    var selectedTabName by rememberSaveable { mutableStateOf(AppTab.CHAT.name) }
    val selectedTab = AppTab.valueOf(selectedTabName)
    val messages = remember { mutableStateListOf<ChatMessage>() }

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
            bottomBar = { FloatingNavigation(selectedTab) { selectedTabName = it.name } }
        ) { insets ->
            when (selectedTab) {
                AppTab.CHAT -> ChatScreen(
                    messages = messages,
                    onNewChat = { messages.clear() },
                    onSettings = { selectedTabName = AppTab.SETTINGS.name },
                    onVoice = { selectedTabName = AppTab.VOICE.name },
                    modifier = Modifier.padding(insets)
                )
                AppTab.VOICE -> VoiceScreen(
                    onSettings = { selectedTabName = AppTab.SETTINGS.name },
                    modifier = Modifier.padding(insets)
                )
                AppTab.SETTINGS -> SettingsScreen(Modifier.padding(insets))
            }
        }
    }
}

@Composable
private fun LucideIcon(resourceId: Int, description: String?, tint: Color, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(resourceId),
        contentDescription = description,
        colorFilter = ColorFilter.tint(tint),
        modifier = modifier
    )
}

@Composable
private fun BrandIcon(provider: String, modifier: Modifier = Modifier) {
    val resource = when (provider.lowercase()) {
        "github" -> R.drawable.ic_github_brand
        "notion" -> R.drawable.ic_notion_brand
        "gmail" -> R.drawable.ic_gmail_brand
        else -> LucideR.drawable.lucide_ic_sparkles
    }
    Image(
        painter = painterResource(resource),
        contentDescription = provider,
        colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurface),
        modifier = modifier
    )
}

@Composable
private fun FloatingNavigation(selected: AppTab, onSelect: (AppTab) -> Unit) {
    Box(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 18.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(25.dp))
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.96f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f), RoundedCornerShape(25.dp))
                .padding(5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AppTab.entries.forEach { tab ->
                val active = selected == tab
                val itemColor by animateColorAsState(
                    if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                    animationSpec = tween(220, easing = FastOutSlowInEasing),
                    label = "navSurface"
                )
                val iconColor by animateColorAsState(
                    if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    animationSpec = tween(180), label = "navIcon"
                )
                Column(
                    Modifier.weight(1f).height(54.dp).clip(RoundedCornerShape(20.dp))
                        .background(itemColor).clickable { onSelect(tab) }.padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    LucideIcon(tab.icon, tab.label, iconColor, Modifier.size(20.dp))
                    Text(
                        tab.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatScreen(
    messages: List<ChatMessage>,
    onNewChat: () -> Unit,
    onSettings: () -> Unit,
    onVoice: () -> Unit,
    modifier: Modifier = Modifier
) {
    var draft by rememberSaveable { mutableStateOf("") }
    var showOfflineNotice by rememberSaveable { mutableStateOf(false) }
    val listState = rememberLazyListState()

    fun send() {
        val text = draft.trim()
        if (text.isNotEmpty()) {
            (messages as? MutableList<ChatMessage>)?.add(ChatMessage(System.nanoTime(), text))
            draft = ""
            showOfflineNotice = true
        }
    }

    Column(modifier.fillMaxSize().imePadding()) {
        ChatHeader(onNewChat = onNewChat, onSettings = onSettings)
        if (messages.isEmpty()) {
            WelcomeScreen(onPrompt = { draft = it }, modifier = Modifier.weight(1f).fillMaxWidth())
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                state = listState,
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                items(messages, key = { it.id }) { message -> UserMessage(message.text) }
                if (showOfflineNotice) {
                    item {
                        NoticeCard(
                            title = "Message not sent",
                            message = "The native chat endpoint is not connected yet. Your message is shown here, but it has not been sent to Nally."
                        )
                    }
                }
            }
            LaunchedEffect(messages.size, showOfflineNotice) {
                val last = listState.layoutInfo.totalItemsCount - 1
                if (last >= 0) listState.animateScrollToItem(last)
            }
        }
        MessageComposer(
            value = draft,
            onValueChange = { draft = it },
            onSend = ::send,
            onVoice = onVoice
        )
    }
}

@Composable
private fun ChatHeader(onNewChat: () -> Unit, onSettings: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 14.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("NallyHermes", style = MaterialTheme.typography.titleLarge)
            Text("YOUR PERSONAL ASSISTANT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        }
        IconAction(LucideR.drawable.lucide_ic_message_circle_plus, "New chat", onNewChat)
        IconAction(LucideR.drawable.lucide_ic_settings_2, "Settings", onSettings)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.42f))
}

@Composable
private fun IconAction(icon: Int, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        LucideIcon(icon, label, MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(21.dp))
    }
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
            Surface(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onPrompt(prompt) },
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f),
                shape = RoundedCornerShape(15.dp)
            ) {
                Row(Modifier.padding(horizontal = 15.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(prompt, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    LucideIcon(LucideR.drawable.lucide_ic_arrow_up_right, null, MaterialTheme.colorScheme.primary, Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
private fun UserMessage(text: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Surface(
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.98f),
            shape = RoundedCornerShape(21.dp, 21.dp, 7.dp, 21.dp)
        ) {
            Text(text, Modifier.padding(horizontal = 17.dp, vertical = 12.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun NoticeCard(title: String, message: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)).padding(14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        LucideIcon(LucideR.drawable.lucide_ic_circle_alert, null, MaterialTheme.colorScheme.primary, Modifier.size(18.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Shows genuine agent thinking/tool events once the Render native progress stream is available. */
@Composable
internal fun AgentActivityCard(activity: AgentActivity, modifier: Modifier = Modifier) {
    val infinite = rememberInfiniteTransition(label = "agentThinking")
    val pulse by infinite.animateFloat(
        initialValue = 0.44f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(850, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "thinkingPulse"
    )
    val scale by animateFloatAsState(if (activity.isThinking && !activity.isComplete) pulse else 1f, label = "activityIcon")
    Row(
        modifier.fillMaxWidth().animateContentSize().clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.93f))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f), RoundedCornerShape(18.dp))
            .padding(horizontal = 13.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp)
    ) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = scale)), contentAlignment = Alignment.Center) {
            if (activity.provider != null) BrandIcon(activity.provider, Modifier.size(17.dp))
            else LucideIcon(
                if (activity.isComplete) LucideR.drawable.lucide_ic_circle_check else LucideR.drawable.lucide_ic_sparkles,
                null, MaterialTheme.colorScheme.primary.copy(alpha = scale), Modifier.size(18.dp)
            )
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
            val alpha by transition.animateFloat(
                initialValue = 0.28f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(620, delayMillis = index * 150, easing = FastOutSlowInEasing),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "thinkingDot$index"
            )
            Box(Modifier.size(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = alpha)))
        }
    }
}

@Composable
private fun MessageComposer(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    onVoice: () -> Unit
) {
    var trayOpen by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().imePadding().padding(horizontal = 13.dp, vertical = 8.dp)) {
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
            Modifier.fillMaxWidth().clip(RoundedCornerShape(27.dp))
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.97f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.66f), RoundedCornerShape(27.dp))
                .padding(horizontal = 16.dp, vertical = 11.dp)
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 1.dp, bottom = 9.dp)) {
                if (value.isEmpty()) {
                    Text("Message NallyHermes · / for tools", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                }
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = Modifier.fillMaxWidth(),
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = { onSend() }),
                    maxLines = 5
                )
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                ComposerIcon(LucideR.drawable.lucide_ic_plus, "Show tools", trayOpen) { trayOpen = !trayOpen }
                Spacer(Modifier.width(8.dp))
                ComposerBrandAction("GitHub") { onValueChange(if (value.isBlank()) "Search GitHub for " else "$value Search GitHub for ") }
                Spacer(Modifier.width(10.dp))
                ComposerIcon(LucideR.drawable.lucide_ic_panels_top_left, "Browse tools", trayOpen) { trayOpen = !trayOpen }
                Spacer(Modifier.weight(1f))
                ComposerIcon(LucideR.drawable.lucide_ic_mic, "Voice setup", false, onVoice)
                Spacer(Modifier.width(7.dp))
                IconButton(
                    onClick = onSend,
                    enabled = value.isNotBlank(),
                    modifier = Modifier.size(40.dp).clip(CircleShape)
                        .background(if (value.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    LucideIcon(
                        LucideR.drawable.lucide_ic_arrow_up,
                        "Send message",
                        if (value.isNotBlank()) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        Modifier.size(20.dp)
                    )
                }
            }
        }
        Text("Not connected · messages stay on this device", Modifier.fillMaxWidth().padding(top = 6.dp, start = 4.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ComposerIcon(icon: Int, description: String, selected: Boolean, onClick: () -> Unit) {
    val tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    IconButton(onClick = onClick, modifier = Modifier.size(36.dp)) {
        LucideIcon(icon, description, tint, Modifier.size(21.dp))
    }
}

@Composable
private fun ComposerBrandAction(provider: String, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(36.dp)) {
        BrandIcon(provider, Modifier.size(21.dp))
    }
}

@Composable
private fun ToolShortcutTray(onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.97f))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.58f), RoundedCornerShape(20.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        Text("ADD A TOOL TO YOUR PROMPT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.8.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("GitHub", "Notion", "Gmail").forEach { provider ->
                Surface(
                    modifier = Modifier.weight(1f).clickable { onSelect("Use $provider to ") },
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.74f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(Modifier.padding(horizontal = 9.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        BrandIcon(provider, Modifier.size(16.dp))
                        Text(provider, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                "Web search" to "Search the web for ",
                "Calendar" to "Check my calendar for ",
                "Memory" to "Recall what you know about "
            ).forEach { (label, prefix) ->
                Surface(
                    modifier = Modifier.weight(1f).clickable { onSelect(prefix) },
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.74f),
                    shape = RoundedCornerShape(14.dp)
                ) {
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
        Box(
            Modifier.size(224.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.72f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.size(154.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.96f)), contentAlignment = Alignment.Center) {
                LucideIcon(LucideR.drawable.lucide_ic_mic, "Voice", MaterialTheme.colorScheme.primary, Modifier.size(48.dp))
            }
        }
        Spacer(Modifier.height(27.dp))
        Text("Voice is waiting for setup", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(7.dp))
        Text("Connect the Render voice endpoint and microphone permissions to start a spoken conversation.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onSettings) { Text("View connection settings") }
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun SettingsScreen(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(horizontal = 22.dp)) {
        Text("Settings", Modifier.padding(top = 26.dp, bottom = 5.dp), style = MaterialTheme.typography.headlineLarge)
        Text("Your app and connection preferences.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(22.dp))
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(17.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LucideIcon(LucideR.drawable.lucide_ic_wifi_off, null, MaterialTheme.colorScheme.error, Modifier.size(20.dp))
                    Text("Render agent", style = MaterialTheme.typography.titleMedium)
                }
                Text("Not connected", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
                Text("The current V3.1 service accepts Telegram webhooks and health checks. A protected native chat/auth API and a progress-event stream are needed before the app can send messages or show live tool activity.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(12.dp))
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f), shape = RoundedCornerShape(18.dp)) {
            Row(Modifier.fillMaxWidth().padding(17.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                LucideIcon(LucideR.drawable.lucide_ic_circle_check, null, MaterialTheme.colorScheme.primary, Modifier.size(20.dp))
                Column {
                    Text("NallyHermes Android", style = MaterialTheme.typography.titleSmall)
                    Text("Native Compose · 3.1", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
