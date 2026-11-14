package com.klyntech.nallyhermes.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

private data class AppDestination(val route: String, val label: String, val icon: ImageVector)

private val destinations = listOf(
    AppDestination("chat", "Chat", Icons.Default.ChatBubbleOutline),
    AppDestination("tasks", "Tasks", Icons.Default.TaskAlt),
    AppDestination("memory", "Memory", Icons.Default.Memory),
    AppDestination("tools", "Tools", Icons.Default.Widgets),
    AppDestination("settings", "Settings", Icons.Default.Settings)
)

@Composable
fun NallyHermesApp() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        contentWindowInsets = WindowInsets.navigationBars,
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 4.dp
            ) {
                destinations.forEach { destination ->
                    val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = MaterialTheme.colorScheme.secondaryContainer
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "chat",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("chat") { ChatScreen() }
            composable("tasks") { TasksScreen() }
            composable("memory") { MemoryScreen() }
            composable("tools") { ToolsScreen() }
            composable("settings") { SettingsScreen() }
        }
    }
}

@Composable
private fun ScreenHeader(
    title: String,
    subtitle: String,
    action: ImageVector? = null,
    onAction: () -> Unit = {}
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (action != null) {
            IconButton(onClick = onAction) {
                Icon(action, contentDescription = "Screen action")
            }
        }
    }
}

@Composable
private fun ChatScreen() {
    data class Message(val text: String, val fromUser: Boolean)
    val messages = remember {
        mutableStateListOf(
            Message("Hello. I'm NallyHermes, your personal AI assistant. I can help with research, planning, coding, and coordinating your tools.", false),
            Message("What can you help me with?", true),
            Message("I can work through multi-step tasks, keep track of approvals, and use the tools you've connected. What would you like to do today?", false)
        )
    }
    var draft by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(42.dp).clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("NallyHermes", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(Color(0xFF35B779)))
                    Spacer(Modifier.width(6.dp))
                    Text("Personal assistant", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            IconButton(onClick = {}) { Icon(Icons.Default.History, contentDescription = "Chat history") }
            IconButton(onClick = {}) { Icon(Icons.Default.MoreHoriz, contentDescription = "More options") }
        }
        Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            AssistChip(onClick = { draft = "Help me plan my day" }, label = { Text("Plan my day") }, leadingIcon = { Icon(Icons.Default.TaskAlt, null, Modifier.size(16.dp)) })
            AssistChip(onClick = { draft = "Summarize my recent work" }, label = { Text("Summarize") }, leadingIcon = { Icon(Icons.Default.Description, null, Modifier.size(16.dp)) })
        }
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(messages) { message ->
                MessageBubble(message.text, message.fromUser)
            }
        }
        Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Message NallyHermes…") },
                    shape = RoundedCornerShape(24.dp),
                    trailingIcon = {
                        FilledIconButton(
                            onClick = {
                                val text = draft.trim()
                                if (text.isNotEmpty()) {
                                    messages.add(Message(text, true))
                                    draft = ""
                                }
                            },
                            enabled = draft.isNotBlank()
                        ) {
                            Icon(Icons.Default.Send, contentDescription = "Send message")
                        }
                    },
                    leadingIcon = {
                        IconButton(onClick = {}) { Icon(Icons.Default.Add, contentDescription = "Add attachment") }
                    },
                    maxLines = 4
                )
                Text(
                    "NallyHermes can make mistakes. Review important actions before approval.",
                    modifier = Modifier.fillMaxWidth().padding(top = 7.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(text: String, fromUser: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (fromUser) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top
    ) {
        if (!fromUser) {
            Box(
                Modifier.padding(top = 2.dp).size(30.dp).clip(RoundedCornerShape(10.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AutoAwesome, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(17.dp))
            }
            Spacer(Modifier.width(9.dp))
        }
        Surface(
            modifier = Modifier.widthInCompat(fromUser),
            color = if (fromUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.62f),
            shape = RoundedCornerShape(
                topStart = 18.dp, topEnd = 18.dp,
                bottomStart = if (fromUser) 18.dp else 5.dp,
                bottomEnd = if (fromUser) 5.dp else 18.dp
            )
        ) {
            Text(
                text,
                modifier = Modifier.padding(horizontal = 15.dp, vertical = 12.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

private fun Modifier.widthInCompat(fromUser: Boolean): Modifier =
    this.then(Modifier.padding(horizontal = if (fromUser) 28.dp else 0.dp))

@Composable
private fun TasksScreen() {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Tasks", "Track work and pending approvals", Icons.Default.Sync)
        Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MetricCard("In progress", "2", Icons.Default.Sync, Modifier.weight(1f))
            MetricCard("Needs review", "1", Icons.Default.Shield, Modifier.weight(1f))
        }
        Text("RECENT ACTIVITY", modifier = Modifier.padding(start = 22.dp, top = 26.dp, bottom = 10.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TaskRow("Prepare project summary", "Research task · Updated 8 min ago", "In progress", Icons.Default.Description)
            TaskRow("Review email draft", "Gmail · Waiting for your approval", "Approval", Icons.Default.Shield)
            TaskRow("Index project documents", "Knowledge base · Completed today", "Completed", Icons.Default.CheckCircle)
        }
        Spacer(Modifier.height(20.dp))
        Card(modifier = Modifier.padding(horizontal = 20.dp).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Shield, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("You stay in control", fontWeight = FontWeight.SemiBold)
                    Text("Actions requiring approval wait for your confirmation.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun MetricCard(title: String, value: String, icon: ImageVector, modifier: Modifier = Modifier) {
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TaskRow(title: String, detail: String, status: String, icon: ImageVector) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(status, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun MemoryScreen() {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Memory", "Your assistant's knowledge base", Icons.Default.Search)
        Card(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Default.Memory, null, tint = MaterialTheme.colorScheme.primary)
                Text("A more contextual assistant", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Review saved context and connected knowledge sources. You remain in control of what is retained.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Text("KNOWLEDGE SOURCES", modifier = Modifier.padding(start = 22.dp, top = 26.dp, bottom = 10.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TaskRow("Conversation context", "Relevant details from your chats", "Available", Icons.Default.ChatBubbleOutline)
            TaskRow("Project documents", "Indexed files and reference material", "Connected", Icons.Default.FolderOpen)
            TaskRow("Knowledge index", "Searchable information store", "Ready", Icons.Default.Storage)
        }
    }
}

@Composable
private fun ToolsScreen() {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Tools", "Connected services and capabilities", Icons.Default.Tune)
        Card(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CloudDone, tint = MaterialTheme.colorScheme.primary, contentDescription = null)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Tool access", fontWeight = FontWeight.SemiBold)
                    Text("Connections are managed securely by your NallyHermes backend.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Text("CAPABILITIES", modifier = Modifier.padding(start = 22.dp, top = 24.dp, bottom = 10.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TaskRow("Web research", "Search and gather information", "Capability", Icons.Default.Search)
            TaskRow("Code assistance", "Help with software and development", "Capability", Icons.Default.Code)
            TaskRow("Voice interaction", "Audio input and transcription", "Capability", Icons.Default.GraphicEq)
            TaskRow("Document processing", "Read and index supported files", "Capability", Icons.Default.Description)
        }
    }
}

@Composable
private fun SettingsScreen() {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Settings", "Personalize your NallyHermes app")
        Card(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(46.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.AutoAwesome, null, tint = MaterialTheme.colorScheme.onPrimary)
                }
                Spacer(Modifier.width(13.dp))
                Column {
                    Text("NallyHermes", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text("Personal AI workspace · v0.1.0", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Text("PREFERENCES", modifier = Modifier.padding(start = 22.dp, top = 25.dp, bottom = 8.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        Column(Modifier.padding(horizontal = 20.dp)) {
            SettingsRow(Icons.Default.Notifications, "Notifications", "Task updates and approval requests")
            SettingsRow(Icons.Default.DarkMode, "Appearance", "Follow system theme")
            SettingsRow(Icons.Default.Shield, "Privacy & security", "Permissions and data controls")
            SettingsRow(Icons.Default.CloudDone, "Connection", "Backend and account status")
            SettingsRow(Icons.Default.Tune, "About", "Version and open-source information")
        }
    }
}

@Composable
private fun SettingsRow(icon: ImageVector, title: String, subtitle: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(15.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontWeight = FontWeight.Medium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.Default.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f))
}
