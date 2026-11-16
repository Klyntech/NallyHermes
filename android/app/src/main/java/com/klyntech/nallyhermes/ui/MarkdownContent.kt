package com.klyntech.nallyhermes.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Full-native Markdown + GFM table renderer for Nally chat bubbles.
 * Handles headings, emphasis, strikethrough, inline code, links, lists,
 * fenced code blocks, blockquotes, horizontal rules, and pipe tables.
 */
@Composable
fun MarkdownContent(
    markdown: String,
    modifier: Modifier = Modifier,
    textColor: Color = MaterialTheme.colorScheme.onSurface,
    mutedColor: Color = MaterialTheme.colorScheme.onSurfaceVariant
) {
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }
    SelectionContainer {
        Column(
            modifier = modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            blocks.forEach { block ->
                when (block) {
                    is MdBlock.Heading -> MarkdownHeading(block, textColor)
                    is MdBlock.Paragraph -> MarkdownParagraph(block.text, textColor)
                    is MdBlock.BulletList -> MarkdownBulletList(block.items, textColor)
                    is MdBlock.OrderedList -> MarkdownOrderedList(block.items, textColor)
                    is MdBlock.CodeBlock -> MarkdownCodeBlock(block)
                    is MdBlock.Quote -> MarkdownQuote(block.text, mutedColor)
                    is MdBlock.Table -> MarkdownTable(block, textColor, mutedColor)
                    is MdBlock.Divider -> HorizontalDivider(
                        modifier = Modifier.padding(vertical = 4.dp),
                        color = mutedColor.copy(alpha = 0.35f)
                    )
                    is MdBlock.Blank -> Spacer(Modifier.height(2.dp))
                }
            }
        }
    }
}

private sealed class MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock()
    data class Paragraph(val text: String) : MdBlock()
    data class BulletList(val items: List<String>) : MdBlock()
    data class OrderedList(val items: List<String>) : MdBlock()
    data class CodeBlock(val language: String?, val code: String) : MdBlock()
    data class Quote(val text: String) : MdBlock()
    data class Table(val headers: List<String>, val aligns: List<Align>, val rows: List<List<String>>) : MdBlock()
    data object Divider : MdBlock()
    data object Blank : MdBlock()
}

private enum class Align { LEFT, CENTER, RIGHT }

private fun parseMarkdownBlocks(source: String): List<MdBlock> {
    val lines = source.replace("\r\n", "\n").replace('\r', '\n').lines()
    val blocks = mutableListOf<MdBlock>()
    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        val trimmed = line.trim()

        if (trimmed.isEmpty()) {
            blocks.add(MdBlock.Blank)
            i++
            continue
        }

        // Fenced code block
        if (trimmed.startsWith("```")) {
            val lang = trimmed.removePrefix("```").trim().ifBlank { null }
            val body = StringBuilder()
            i++
            while (i < lines.size && !lines[i].trim().startsWith("```")) {
                if (body.isNotEmpty()) body.append('\n')
                body.append(lines[i])
                i++
            }
            if (i < lines.size) i++ // closing fence
            blocks.add(MdBlock.CodeBlock(lang, body.toString()))
            continue
        }

        // Table: header + separator + rows
        if (isTableHeader(lines, i)) {
            val headers = splitTableRow(lines[i])
            val aligns = parseAlignRow(lines[i + 1])
            val rows = mutableListOf<List<String>>()
            i += 2
            while (i < lines.size && lines[i].contains('|') && lines[i].trim().isNotEmpty()) {
                rows.add(splitTableRow(lines[i]))
                i++
            }
            blocks.add(MdBlock.Table(headers, aligns, rows))
            continue
        }

        // Heading
        val heading = Regex("^(#{1,6})\\s+(.+)$").find(trimmed)
        if (heading != null) {
            blocks.add(MdBlock.Heading(heading.groupValues[1].length, heading.groupValues[2].trim()))
            i++
            continue
        }

        // Horizontal rule
        if (Regex("^(-{3,}|\\*{3,}|_{3,})$").matches(trimmed)) {
            blocks.add(MdBlock.Divider)
            i++
            continue
        }

        // Blockquote
        if (trimmed.startsWith(">")) {
            val quoteLines = mutableListOf<String>()
            while (i < lines.size && lines[i].trim().startsWith(">")) {
                quoteLines.add(lines[i].trim().removePrefix(">").trimStart())
                i++
            }
            blocks.add(MdBlock.Quote(quoteLines.joinToString("\n")))
            continue
        }

        // Unordered list
        if (Regex("^[-*+]\\s+.+$").matches(trimmed)) {
            val items = mutableListOf<String>()
            while (i < lines.size && Regex("^[-*+]\\s+.+$").matches(lines[i].trim())) {
                items.add(lines[i].trim().replaceFirst(Regex("^[-*+]\\s+"), ""))
                i++
            }
            blocks.add(MdBlock.BulletList(items))
            continue
        }

        // Ordered list
        if (Regex("^\\d+[.)]\\s+.+$").matches(trimmed)) {
            val items = mutableListOf<String>()
            while (i < lines.size && Regex("^\\d+[.)]\\s+.+$").matches(lines[i].trim())) {
                items.add(lines[i].trim().replaceFirst(Regex("^\\d+[.)]\\s+"), ""))
                i++
            }
            blocks.add(MdBlock.OrderedList(items))
            continue
        }

        // Paragraph (merge consecutive non-empty, non-special lines)
        val para = StringBuilder(trimmed)
        i++
        while (i < lines.size) {
            val next = lines[i].trim()
            if (next.isEmpty()) break
            if (next.startsWith("```") || next.startsWith("#") || next.startsWith(">") ||
                Regex("^[-*+]\\s+.+$").matches(next) || Regex("^\\d+[.)]\\s+.+$").matches(next) ||
                Regex("^(-{3,}|\\*{3,}|_{3,})$").matches(next) || isTableHeader(lines, i)
            ) break
            para.append(' ').append(next)
            i++
        }
        blocks.add(MdBlock.Paragraph(para.toString()))
    }
    return blocks.filterNot { it is MdBlock.Blank && blocks.indexOf(it).let { idx -> idx == 0 || idx == blocks.lastIndex } }
}

private fun isTableHeader(lines: List<String>, index: Int): Boolean {
    if (index + 1 >= lines.size) return false
    if (!lines[index].contains('|')) return false
    val sep = lines[index + 1].trim()
    return Regex("^\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?$").matches(sep)
}

private fun splitTableRow(line: String): List<String> {
    var s = line.trim()
    if (s.startsWith("|")) s = s.drop(1)
    if (s.endsWith("|")) s = s.dropLast(1)
    return s.split('|').map { it.trim() }
}

private fun parseAlignRow(line: String): List<Align> {
    return splitTableRow(line).map { cell ->
        val c = cell.trim()
        val left = c.startsWith(':')
        val right = c.endsWith(':')
        when {
            left && right -> Align.CENTER
            right -> Align.RIGHT
            else -> Align.LEFT
        }
    }
}

@Composable
private fun MarkdownHeading(block: MdBlock.Heading, color: Color) {
    val style = when (block.level) {
        1 -> MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold)
        2 -> MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold)
        3 -> MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
        4 -> MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
        else -> MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold)
    }
    InlineMarkdownText(block.text, style, color)
}

@Composable
private fun MarkdownParagraph(text: String, color: Color) {
    InlineMarkdownText(text, MaterialTheme.typography.bodyMedium, color)
}

@Composable
private fun MarkdownBulletList(items: List<String>, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("•", style = MaterialTheme.typography.bodyMedium, color = color)
                InlineMarkdownText(item, MaterialTheme.typography.bodyMedium, color, Modifier.weight(1f, fill = false))
            }
        }
    }
}

@Composable
private fun MarkdownOrderedList(items: List<String>, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        items.forEachIndexed { index, item ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${index + 1}.", style = MaterialTheme.typography.bodyMedium, color = color)
                InlineMarkdownText(item, MaterialTheme.typography.bodyMedium, color, Modifier.weight(1f, fill = false))
            }
        }
    }
}

@Composable
private fun MarkdownCodeBlock(block: MdBlock.CodeBlock) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        color = scheme.surfaceVariant.copy(alpha = 0.55f),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(12.dp)) {
            block.language?.takeIf { it.isNotBlank() }?.let { lang ->
                Text(
                    lang.lowercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 6.dp)
                )
            }
            Text(
                block.code,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    lineHeight = 18.sp
                ),
                color = scheme.onSurface
            )
        }
    }
}

@Composable
private fun MarkdownQuote(text: String, muted: Color) {
    Row(Modifier.fillMaxWidth()) {
        Spacer(
            Modifier
                .width(3.dp)
                .height(IntrinsicSizeMinPlaceholder)
                .clip(RoundedCornerShape(2.dp))
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.55f))
        )
        // Use a fixed visual bar via border instead of intrinsic height gymnastics
    }
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(Modifier.padding(start = 0.dp)) {
            Spacer(
                Modifier
                    .width(3.dp)
                    .padding(vertical = 0.dp)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.6f))
            )
            InlineMarkdownText(
                text,
                MaterialTheme.typography.bodyMedium.copy(fontStyle = FontStyle.Italic),
                muted,
                Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
            )
        }
    }
}

// Dummy to satisfy unused path above — quote uses Surface path
private val IntrinsicSizeMinPlaceholder = 1.dp

@Composable
private fun MarkdownTable(
    block: MdBlock.Table,
    textColor: Color,
    mutedColor: Color
) {
    val scheme = MaterialTheme.colorScheme
    val colCount = maxOf(block.headers.size, block.rows.maxOfOrNull { it.size } ?: 0)
    if (colCount == 0) return

    val scroll = rememberScrollState()
    Column(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(scroll)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, scheme.outlineVariant.copy(alpha = 0.55f), RoundedCornerShape(12.dp))
            .background(scheme.surface.copy(alpha = 0.92f))
    ) {
        // Header
        Row(Modifier.background(scheme.primaryContainer.copy(alpha = 0.55f))) {
            for (c in 0 until colCount) {
                val cell = block.headers.getOrElse(c) { "" }
                TableCell(
                    text = cell,
                    bold = true,
                    color = textColor,
                    align = block.aligns.getOrElse(c) { Align.LEFT }
                )
            }
        }
        HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.45f))
        block.rows.forEachIndexed { rowIndex, row ->
            Row(
                Modifier.background(
                    if (rowIndex % 2 == 0) Color.Transparent
                    else scheme.surfaceVariant.copy(alpha = 0.28f)
                )
            ) {
                for (c in 0 until colCount) {
                    val cell = row.getOrElse(c) { "" }
                    TableCell(
                        text = cell,
                        bold = false,
                        color = textColor,
                        align = block.aligns.getOrElse(c) { Align.LEFT }
                    )
                }
            }
            if (rowIndex < block.rows.lastIndex) {
                HorizontalDivider(color = scheme.outlineVariant.copy(alpha = 0.28f))
            }
        }
    }
}

@Composable
private fun TableCell(
    text: String,
    bold: Boolean,
    color: Color,
    align: Align
) {
    val style = MaterialTheme.typography.bodySmall.copy(
        fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal
    )
    val annotated = remember(text) { buildInlineAnnotated(text, color) }
    val uriHandler = LocalUriHandler.current
    ClickableText(
        text = annotated,
        style = style.copy(
            textAlign = when (align) {
                Align.LEFT -> androidx.compose.ui.text.style.TextAlign.Start
                Align.CENTER -> androidx.compose.ui.text.style.TextAlign.Center
                Align.RIGHT -> androidx.compose.ui.text.style.TextAlign.End
            }
        ),
        modifier = Modifier
            .width(128.dp)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        onClick = { offset ->
            annotated.getStringAnnotations("URL", offset, offset)
                .firstOrNull()
                ?.let { runCatching { uriHandler.openUri(it.item) } }
        }
    )
}

@Composable
private fun InlineMarkdownText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier
) {
    val annotated = remember(text, color) { buildInlineAnnotated(text, color) }
    val uriHandler = LocalUriHandler.current
    ClickableText(
        text = annotated,
        style = style.copy(color = color),
        modifier = modifier,
        onClick = { offset ->
            annotated.getStringAnnotations("URL", offset, offset)
                .firstOrNull()
                ?.let { runCatching { uriHandler.openUri(it.item) } }
        }
    )
}

private fun buildInlineAnnotated(source: String, baseColor: Color): AnnotatedString {
    // Patterns: **bold**, *italic*, ~~strike~~, `code`, [label](url)
    val pattern = Regex(
        """(\*\*(.+?)\*\*)|(\*(.+?)\*)|(~~(.+?)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))"""
    )
    return buildAnnotatedString {
        var cursor = 0
        for (match in pattern.findAll(source)) {
            if (match.range.first > cursor) {
                withStyle(SpanStyle(color = baseColor)) {
                    append(source.substring(cursor, match.range.first))
                }
            }
            when {
                match.groups[2] != null -> { // **bold**
                    withStyle(SpanStyle(color = baseColor, fontWeight = FontWeight.Bold)) {
                        append(match.groupValues[2])
                    }
                }
                match.groups[4] != null -> { // *italic*
                    withStyle(SpanStyle(color = baseColor, fontStyle = FontStyle.Italic)) {
                        append(match.groupValues[4])
                    }
                }
                match.groups[6] != null -> { // ~~strike~~
                    withStyle(SpanStyle(color = baseColor, textDecoration = TextDecoration.LineThrough)) {
                        append(match.groupValues[6])
                    }
                }
                match.groups[8] != null -> { // `code`
                    withStyle(
                        SpanStyle(
                            color = baseColor,
                            fontFamily = FontFamily.Monospace,
                            background = Color(0x22FFFFFF)
                        )
                    ) {
                        append(match.groupValues[8])
                    }
                }
                match.groups[10] != null -> { // [label](url)
                    val label = match.groupValues[10]
                    val url = match.groupValues[11]
                    val start = length
                    withStyle(
                        SpanStyle(
                            color = Color(0xFF3D8CDB),
                            textDecoration = TextDecoration.Underline
                        )
                    ) {
                        append(label)
                    }
                    addStringAnnotation("URL", url, start, length)
                }
            }
            cursor = match.range.last + 1
        }
        if (cursor < source.length) {
            withStyle(SpanStyle(color = baseColor)) {
                append(source.substring(cursor))
            }
        }
    }
}
