package com.klyntech.nallyhermes.ui

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
        Box(
            Modifier.fillMaxSize().background(
                MaterialTheme.colorScheme.background.copy(alpha = 0.82f)
            )
        )
        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                FloatingNavigation(selected = selectedTab, onSelect = { selectedTabName = it.name })
            }
        ) { insets ->
            when (selectedTab) {
                AppTab.CHAT -> ChatScreen(
                    messages = messages,
                    onNewChat = { messages.clear() },
                    onSettings = { selectedTabName = AppTab.SETTINGS.name },
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
private fun FloatingNavigation(selected: AppTab, onSelect: (AppTab) -> Unit) {
    Box(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(30.dp))
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.93f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.68f), RoundedCornerShape(30.dp))
                .padding(5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AppTab.entries.forEach { tab ->
                val active = selected == tab
                Column(
                    Modifier.weight(1f)
                        .height(58.dp)
                        .clip(RoundedCornerShape(25.dp))
                        .background(if (active) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.94f) else Color.Transparent)
                        .clickable { onSelect(tab) }
                        .padding(vertical = 7.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(3.dp)
                ) {
                    LucideIcon(
                        resourceId = tab.icon,
                        description = tab.label,
                        tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(22.dp)
                    )
                    Text(
                        text = tab.label,
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
    messages: MutableList<ChatMessage>,
    onNewChat: () -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    var draft by rememberSaveable { mutableStateOf("") }
    var showOfflineNotice by rememberSaveable { mutableStateOf(false) }
    val listState = rememberLazyListState()

    fun send() {
        val text = draft.trim()
        if (text.isNotEmpty()) {
            messages.add(ChatMessage(System.nanoTime(), text))
            draft = ""
            showOfflineNotice = true
        }
    }

    Column(modifier.fillMaxSize().imePadding()) {
        ChatHeader(onNewChat = onNewChat, onSettings = onSettings)
        ConnectionStrip(onClick = onSettings)

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
                            title = "Not connected to NallyHermes yet",
                            message = "This server currently accepts Telegram webhooks only. Nothing was sent; your draft stays in this chat view."
                        )
                    }
                }
            }
            LaunchedEffect(messages.size, showOfflineNotice) {
                val last = listState.layoutInfo.totalItemsCount - 1
                if (last >= 0) listState.animateScrollToItem(last)
            }
        }

        MessageComposer(value = draft, onValueChange = { draft = it }, onSend = ::send)
    }
}

@Composable
private fun ChatHeader(onNewChat: () -> Unit, onSettings: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 14.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("NallyHermes", style = MaterialTheme.typography.titleLarge)
            Text("YOUR PERSONAL ASSISTANT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        }
        IconAction(LucideR.drawable.lucide_ic_message_circle_plus, "New chat", onNewChat)
        IconAction(LucideR.drawable.lucide_ic_settings_2, "Settings", onSettings)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.48f))
}

@Composable
private fun IconAction(icon: Int, label: String, onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        LucideIcon(icon, label, MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(21.dp))
    }
}

@Composable
private fun ConnectionStrip(onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 9.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.82f))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp)
    ) {
        LucideIcon(LucideR.drawable.lucide_ic_wifi_off, null, MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(16.dp))
        Text("Agent connection needs setup", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        LucideIcon(LucideR.drawable.lucide_ic_arrow_up_right, "Open settings", MaterialTheme.colorScheme.primary, Modifier.size(16.dp))
    }
}

@Composable
private fun WelcomeScreen(onPrompt: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("A calmer space\nto think things through.", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(10.dp))
        Text("Ask Nally to help with a question, an idea, or what comes next.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(28.dp))
        Text("A PLACE TO START", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        Spacer(Modifier.height(9.dp))
        listOf("Help me plan my day", "Think through a business idea", "Summarize a document").forEach { prompt ->
            Surface(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onPrompt(prompt) },
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.86f),
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
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.96f),
            shape = RoundedCornerShape(19.dp, 19.dp, 6.dp, 19.dp)
        ) {
            Text(text, Modifier.padding(horizontal = 16.dp, vertical = 12.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun NoticeCard(title: String, message: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.90f)).padding(14.dp),
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

@Composable
private fun MessageComposer(value: String, onValueChange: (String) -> Unit, onSend: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(23.dp))
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.95f))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f), RoundedCornerShape(23.dp))
                .padding(start = 16.dp, end = 7.dp, top = 7.dp, bottom = 7.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Box(Modifier.weight(1f).padding(vertical = 10.dp)) {
                if (value.isEmpty()) Text("Message NallyHermes", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
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
            IconButton(
                onClick = onSend,
                enabled = value.isNotBlank(),
                modifier = Modifier.size(42.dp).clip(CircleShape).background(if (value.isNotBlank()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
            ) {
                LucideIcon(LucideR.drawable.lucide_ic_send_horizontal, "Send message", if (value.isNotBlank()) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, Modifier.size(19.dp))
            }
        }
        Text("The Render chat service is not connected yet.", Modifier.fillMaxWidth().padding(top = 7.dp, start = 3.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun VoiceScreen(onSettings: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
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
            Box(
                Modifier.size(154.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.96f)),
                contentAlignment = Alignment.Center
            ) {
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
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.93f), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(17.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LucideIcon(LucideR.drawable.lucide_ic_wifi_off, null, MaterialTheme.colorScheme.error, Modifier.size(20.dp))
                    Text("Render agent", style = MaterialTheme.typography.titleMedium)
                }
                Text("Not connected", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
                Text("The current V3.1 service accepts Telegram webhooks and health checks. A protected native chat API and sign-in flow are needed before the app can send messages.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(12.dp))
        Surface(color = MaterialTheme.colorScheme.surface.copy(alpha = 0.93f), shape = RoundedCornerShape(18.dp)) {
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
