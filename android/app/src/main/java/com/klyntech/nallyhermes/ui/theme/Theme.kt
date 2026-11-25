package com.klyntech.nallyhermes.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Manrope is the product typeface target. SansSerif is the safe platform fallback
// until a licensed, bundled Manrope font asset is added to the Android project.
private val ProductFont = FontFamily.SansSerif

private val ProductTypography = Typography(
    displayLarge = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 38.sp, letterSpacing = (-0.6).sp),
    displayMedium = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 36.sp, letterSpacing = (-0.4).sp),
    headlineLarge = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 34.sp, letterSpacing = (-0.4).sp),
    headlineMedium = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 23.sp, lineHeight = 30.sp, letterSpacing = (-0.3).sp),
    headlineSmall = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 27.sp),
    titleLarge = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 25.sp),
    titleMedium = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 23.sp),
    titleSmall = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 25.sp),
    bodyMedium = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 22.sp),
    bodySmall = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp),
    labelMedium = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, letterSpacing = 0.2.sp),
    labelSmall = TextStyle(fontFamily = ProductFont, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 15.sp, letterSpacing = 0.25.sp)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA7B09A), onPrimary = Color(0xFF252B20),
    primaryContainer = Color(0xFF343B30), onPrimaryContainer = Color(0xFFE0E6D8),
    secondary = Color(0xFFA7AAA3), onSecondary = Color(0xFF292B27),
    secondaryContainer = Color(0xFF343630), onSecondaryContainer = Color(0xFFE1E2DC),
    background = Color(0xFF191A18), onBackground = Color(0xFFF1F2ED),
    surface = Color(0xFF232521), onSurface = Color(0xFFF1F2ED),
    surfaceVariant = Color(0xFF2B2D28), onSurfaceVariant = Color(0xFFA7AAA3),
    outline = Color(0xFF777A72), outlineVariant = Color(0xFF3D403A),
    error = Color(0xFFF2B8B5), onError = Color(0xFF601410)
)

/**
 * The login, welcome and voice screens use a hard-coded dark palette, so following a light system
 * theme produced a half-light, half-dark app. Dark is used everywhere until a full light theme exists.
 */
@Composable
fun NallyHermesTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = DarkColors, typography = ProductTypography, content = content)
}
