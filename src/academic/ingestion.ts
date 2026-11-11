import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { indexAcademicDocument } from "../agent/lightRag.js";
import { addAcademicDocument, updateAcademicDocumentStatus } from "./store.js";

const execFileAsync = promisify(execFile);

function workspaceFor(telegramId: string): string {
  if (!/^\d{1,25}$/.test(telegramId)) throw new Error("Invalid academic user context.");
  return path.resolve(config.FILE_WORKSPACE, telegramId, "academic");
}

function safeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 180);
  return base || "academic-document.pdf";
}

export async function ingestAcademicDocument(telegramId: string, input: { title: string; course?: string; sourceType?: string; fileName: string; mimeType: string; base64: string }) {
  if (!input.title?.trim()) throw new Error("A document title is required.");
  if (!input.base64 || input.base64.length > Math.ceil(config.INGESTION_MAX_UPLOAD_BYTES * 1.4)) throw new Error("The upload is empty or exceeds the configured size limit.");
  const buffer = Buffer.from(input.base64, "base64");
  if (!buffer.length || buffer.length > config.INGESTION_MAX_UPLOAD_BYTES) throw new Error("The upload is empty or exceeds the configured size limit.");
  const folder = workspaceFor(telegramId);
  await mkdir(folder, { recursive: true });
  const fileName = `${Date.now()}-${safeFileName(input.fileName)}`;
  const filePath = path.join(folder, fileName);
  await writeFile(filePath, buffer, { flag: "wx" });

  let extractedText: string | undefined;
  let status = "stored";
  let error: string | undefined;
  const isPdf = input.mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    try {
      const extracted = await execFileAsync("pdftotext", ["-layout", filePath, "-"], { timeout: 20_000, maxBuffer: 2_000_000 });
      extractedText = extracted.stdout.trim();
      status = extractedText ? "extracted" : "stored_no_text";
    } catch (cause) {
      status = "stored_extraction_failed";
      error = cause instanceof Error ? cause.message.slice(0, 1000) : "PDF text extraction failed.";
    }
  } else {
    status = "stored";
  }

  const document = await addAcademicDocument(telegramId, {
    title: input.title,
    course: input.course,
    sourceType: input.sourceType ?? "document",
    originalName: input.fileName,
    filePath,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: buffer.length,
    extractedText,
    status,
    error
  });
  if (!extractedText || status === "stored_extraction_failed" || !config.LIGHTRAG_ENABLED) return document;
  try {
    const indexed = await indexAcademicDocument(telegramId, document.id, input.title, input.course, extractedText, filePath);
    if (indexed) return (await updateAcademicDocumentStatus(telegramId, document.id, "indexed")) ?? document;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message.slice(0, 1000) : "LightRAG indexing failed.";
    return (await updateAcademicDocumentStatus(telegramId, document.id, "extracted_index_failed", detail)) ?? document;
  }
  return document;
}
