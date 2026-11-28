package com.klyntech.nallyhermes.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Floating "In call" chip shown on Chat and Settings while a voice call is running. Tap to return; End hangs up. */
@Composable
internal fun InCallPill(
    visible: Boolean,
    state: VoiceUiState,
    onOpen: () -> Unit,
    onHangUp: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(tween(200)) + slideInVertically(tween(260, easing = FastOutSlowInEasing)) { -it },
        exit = fadeOut(tween(140)) + slideOutVertically(tween(180, easing = FastOutSlowInEasing)) { -it }
    ) {
        val pulse by rememberInfiniteTransition(label = "callPulse").animateFloat(
            initialValue = 0.4f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "callPulseValue"
        )
        val label = when (state) {
            VoiceUiState.Speaking -> "In call · Speaking"
            VoiceUiState.Thinking, VoiceUiState.Tool -> "In call · Thinking"
            VoiceUiState.Reconnecting -> "Reconnecting…"
            VoiceUiState.Connecting -> "Connecting…"
            else -> "In call · Listening"
        }
        Row(
            Modifier
                .padding(top = 6.dp)
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFF1B261D).copy(alpha = 0.97f))
                .border(1.dp, Color(0xFFA3B18A).copy(alpha = 0.35f), RoundedCornerShape(999.dp))
                .clickable(onClick = onOpen)
                .padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(Color(0xFFA3B18A).copy(alpha = pulse)))
            Text(label, color = Color(0xFFECEBE6), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Box(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFF3A1F1B))
                    .clickable(onClick = onHangUp)
                    .padding(horizontal = 13.dp, vertical = 7.dp)
            ) {
                Text("End", color = Color(0xFFE07A6A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
