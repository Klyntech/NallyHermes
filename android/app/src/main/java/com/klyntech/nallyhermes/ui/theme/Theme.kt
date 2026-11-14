package com.klyntech.nallyhermes.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF365FD6),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDCE5FF),
    onPrimaryContainer = Color(0xFF10275F),
    secondary = Color(0xFF465B83),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDCE3F8),
    onSecondaryContainer = Color(0xFF172B4D),
    background = Color(0xFFF7F8FC),
    onBackground = Color(0xFF191C24),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF191C24),
    surfaceVariant = Color(0xFFE9ECF5),
    onSurfaceVariant = Color(0xFF454B5A),
    outline = Color(0xFF747B8C),
    outlineVariant = Color(0xFFD4D9E5)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFB4C5FF),
    onPrimary = Color(0xFF18316F),
    primaryContainer = Color(0xFF29468D),
    onPrimaryContainer = Color(0xFFDCE5FF),
    secondary = Color(0xFFBAC7E8),
    onSecondary = Color(0xFF26334D),
    secondaryContainer = Color(0xFF3B4965),
    onSecondaryContainer = Color(0xFFDCE3F8),
    background = Color(0xFF11141B),
    onBackground = Color(0xFFE2E5EF),
    surface = Color(0xFF171B24),
    onSurface = Color(0xFFE2E5EF),
    surfaceVariant = Color(0xFF292F3C),
    onSurfaceVariant = Color(0xFFC1C7D5),
    outline = Color(0xFF8B93A5),
    outlineVariant = Color(0xFF414958)
)

@Composable
fun NallyHermesTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
