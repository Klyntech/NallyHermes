package com.klyntech.nallyhermes.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AppColors = lightColorScheme(
    primary = Color(0xFF356FE5),
    onPrimary = Color.White,
    secondary = Color(0xFF14213A),
    background = Color(0xFFF6F8FC),
    surface = Color.White
)

@Composable
fun NallyHermesTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AppColors, content = content)
}
