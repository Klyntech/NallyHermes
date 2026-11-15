package com.klyntech.nallyhermes.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private enum class AppTab(val label: String) {
    CHAT("Chat"), HISTORY("History"), SETTINGS("Settings")
}

private data class ChatMessage(val id: Long, val text: String, val fromUser: Boolean)

@Composable
fun NallyHermesApp() {
    var selectedTab by rememberSaveable { mutableStateOf(AppTab.CHAT.name) }
    val tab = AppTab.valueOf(selectedTab)

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            AppNavigation(selected = tab, onSelect = { selectedTab = it.name })
        }
    ) { insets ->
        when (tab) {
            AppTab.CHAT -> ChatScreen(onHistory = { selectedTab = AppTab.HISTORY.name }, modifier = Modifier.padding(insets))
            AppTab.HISTORY -> HistoryScreen(Modifier.padding(insets), onOpenChat = { selectedTab = AppTab.CHAT.name })
            AppTab.SETTINGS -> SettingsScreen(Modifier.padding(insets))
        }
    }
}

@Composable
private fun AppNavigation(selected: AppTab, onSelect: (AppTab) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 4.dp) {
        Column(Modifier.navigationBarsPadding()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(
                Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AppTab.entries.forEach { tab ->
                    val active = selected == tab
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).clickable { onSelect(tab) }.padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = when (tab) {
                                AppTab.CHAT -> Icons.Default.AutoAwesome
                                AppTab.HISTORY -> Icons.Default.History
                                AppTab.SETTINGS -> Icons.Default.Settings
                            },
                            contentDescription = tab.label,
                            tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
                        )
                        Text(tab.label, style = MaterialTheme.typography.labelSmall, color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatScreen(onHistory: () -> Unit, modifier: Modifier = Modifier) {
    val messages = remember { mutableStateListOf<ChatMessage>() }
    var draft by rememberSaveable { mutableStateOf("") }
    var connectionNotice by rememberSaveable { mutableStateOf(false) }
    val listState = rememberLazyListState()

    fun send() {
        val text = draft.trim()
        if (text.isNotEmpty()) {
            messages.add(ChatMessage(System.nanoTime(), text, true))
            draft = ""
            connectionNotice = true
        }
    }

    Column(modifier.fillMaxSize().imePadding()) {
        ChatTopBar(onHistory = onHistory, onMore = { connectionNotice = !connectionNotice })
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
        ConnectionBanner()

        if (messages.isEmpty()) {
            WelcomeContent(onPrompt = { draft = it }, modifier = Modifier.weight(1f).fillMaxWidth())
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                state = listState,
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(22.dp)
            ) {
                items(messages, key = { it.id }) { message ->
                    if (message.fromUser) UserBubble(message.text) else AssistantBubble(message.text)
                }
                if (connectionNotice) {
                    item {
                        InlineNotice(
                            title = "Render chat API not connected",
                            body = "This V3.1 server currently accepts Telegram webhooks only. Your message is kept on this screen; no request was sent."
                        )
                    }
                }
            }
            LaunchedEffect(messages.size, connectionNotice) {
                listState.animateScrollToItem(listState.layoutInfo.totalItemsCount.coerceAtLeast(1) - 1)
            }
        }

        Composer(
            value = draft,
            onValueChange = { draft = it },
            onSend = ::send,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun ChatTopBar(onHistory: () -> Unit, onMore: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text("NallyHermes", style = MaterialTheme.typography.titleMedium)
            Text("Personal AI", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        IconButton(onClick = onHistory) { Icon(Icons.Default.History, contentDescription = "Conversation history", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
        IconButton(onClick = onMore) { Icon(Icons.Default.MoreHoriz, contentDescription = "More options", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun ConnectionBanner() {
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)).padding(horizontal = 20.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Default.WifiOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
        Text("Agent connection not configured", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text("SETUP", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
    }
}

@Composable
private fun WelcomeContent(onPrompt: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.padding(horizontal = 24.dp), verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(50.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(25.dp))
        }
        Spacer(Modifier.height(24.dp))
        Text("A little more room to think.", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(8.dp))
        Text("Your NallyHermes conversations, in a native Android space.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(28.dp))
        Text("TRY A PROMPT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 1.sp)
        Spacer(Modifier.height(8.dp))
        listOf("Help me plan my day", "Think through a business idea", "Summarize a document").forEach { prompt ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onPrompt(prompt) }.padding(vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(prompt, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f))
        }
    }
}

@Composable
private fun UserBubble(text: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(18.dp, 18.dp, 5.dp, 18.dp)) {
            Text(text, Modifier.padding(horizontal = 16.dp, vertical = 13.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun AssistantBubble(text: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(25.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(14.dp))
            }
            Text("NallyHermes", style = MaterialTheme.typography.labelLarge)
        }
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun InlineNotice(title: String, body: String) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(14.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Default.WifiOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Composer(value: String, onValueChange: (String) -> Unit, onSend: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.background(MaterialTheme.colorScheme.background).padding(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 10.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(22.dp)).padding(start = 16.dp, end = 7.dp, top = 7.dp, bottom = 7.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Box(Modifier.weight(1f).padding(vertical = 11.dp)) {
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
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send message", tint = if (value.isNotBlank()) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(19.dp))
            }
        }
        Text("Connect your Render service to start chatting.", Modifier.fillMaxWidth().padding(top = 7.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun HistoryScreen(modifier: Modifier = Modifier, onOpenChat: () -> Unit) {
    Column(modifier.fillMaxSize().padding(horizontal = 22.dp)) {
        Text("Your conversations", Modifier.padding(top = 28.dp, bottom = 6.dp), style = MaterialTheme.typography.headlineLarge)
        Text("Recent chats will appear here once the Render chat API is connected.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Default.History, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text("No conversations yet", style = MaterialTheme.typography.titleMedium)
                Text("Your Telegram history remains unchanged. Native-app history will be available after backend authentication is added.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = onOpenChat, contentPadding = PaddingValues(0.dp)) { Text("Go to chat") }
            }
        }
    }
}

@Composable
private fun SettingsScreen(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(horizontal = 22.dp)) {
        Text("Settings", Modifier.padding(top = 28.dp, bottom = 6.dp), style = MaterialTheme.typography.headlineLarge)
        Text("App preferences and service status.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
        Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Default.WifiOff, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    Text("Render agent", style = MaterialTheme.typography.titleMedium)
                }
                Text("Not connected", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
                Text("This V3.1 backend currently exposes Telegram webhooks and health checks. A protected native chat API and sign-in flow are needed before this app can send messages.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(14.dp))
        Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Column {
                    Text("NallyHermes Android", style = MaterialTheme.typography.titleSmall)
                    Text("Native Compose client · 3.1", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
