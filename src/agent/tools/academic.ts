import { and, desc, eq, ilike, isNotNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { academicDocuments, users } from "../../db/schema.js";
import { deleteAcademicDocument, updateAcademicDocumentMetadata } from "../../academic/store.js";
import { searchAcademicSources } from "../nativeRag.js";
import type { ToolProgressReporter } from "../progress.js";

async function getUserId(telegramId: string): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new Error("Academic user profile is not ready yet.");
  return user.id;
}

export type AcademicToolInput = {
  operation: "list" | "search" | "get" | "delete" | "rename";
  query?: string;
  document_id?: string;
  course?: string;
  title?: string;
};

const MAX_EXTRACT_CHARS = 12_000;

export async function academicTool(
  telegramId: string,
  input: AcademicToolInput,
  onProgress?: ToolProgressReporter
): Promise<unknown> {
  const userId = await getUserId(telegramId);

  switch (input.operation) {
    case "list": {
      await onProgress?.({ type: "tool_progress", tool: "academic", stage: "academic_list" });
      const course = input.course?.trim();
      const rows = await db
        .select({
          id: academicDocuments.id,
          title: academicDocuments.title,
          course: academicDocuments.course,
          status: academicDocuments.status,
          originalName: academicDocuments.originalName,
          sizeBytes: academicDocuments.sizeBytes,
          createdAt: academicDocuments.createdAt,
          error: academicDocuments.error
        })
        .from(academicDocuments)
        .where(
          course
            ? and(eq(academicDocuments.userId, userId), ilike(academicDocuments.course, `%${course.slice(0, 100)}%`))
            : eq(academicDocuments.userId, userId)
        )
        .orderBy(desc(academicDocuments.createdAt))
        .limit(50);
      return {
        documents: rows.map((row) => ({
          id: row.id,
          title: row.title,
          course: row.course,
          status: row.status,
          original_name: row.originalName,
          size_bytes: row.sizeBytes,
          created_at: row.createdAt,
          error: row.error
        })),
        count: rows.length
      };
    }

    case "get": {
      if (!input.document_id?.trim()) throw new Error("document_id is required for academic get.");
      await onProgress?.({ type: "tool_progress", tool: "academic", stage: "academic_get" });
      const [row] = await db
        .select()
        .from(academicDocuments)
        .where(and(eq(academicDocuments.id, input.document_id.trim()), eq(academicDocuments.userId, userId)))
        .limit(1);
      if (!row) return { found: false };
      const text = row.extractedText ?? "";
      return {
        found: true,
        id: row.id,
        title: row.title,
        course: row.course,
        status: row.status,
        original_name: row.originalName,
        mime_type: row.mimeType,
        size_bytes: row.sizeBytes,
        source_type: row.sourceType,
        error: row.error,
        created_at: row.createdAt,
        extracted_text: text ? text.slice(0, MAX_EXTRACT_CHARS) : null,
        extracted_text_truncated: text.length > MAX_EXTRACT_CHARS,
        extracted_text_chars: text.length
      };
    }

    case "search": {
      const query = input.query?.trim();
      if (!query) throw new Error("query is required for academic search.");
      await onProgress?.({ type: "tool_progress", tool: "academic", stage: "academic_search" });

      const course = input.course?.trim();
      const catalog = await db
        .select({
          id: academicDocuments.id,
          title: academicDocuments.title,
          course: academicDocuments.course,
          status: academicDocuments.status,
          has_text: isNotNull(academicDocuments.extractedText)
        })
        .from(academicDocuments)
        .where(
          course
            ? and(eq(academicDocuments.userId, userId), ilike(academicDocuments.course, `%${course.slice(0, 100)}%`))
            : eq(academicDocuments.userId, userId)
        )
        .orderBy(desc(academicDocuments.createdAt))
        .limit(50);

      const sources = await searchAcademicSources(userId, query, course);
      const searchableCount = catalog.filter((doc) => doc.has_text).length;

      return {
        query,
        course: course ?? null,
        sources: sources.map((source) => ({
          document_id: source.document_id,
          title: source.title,
          course: source.course,
          original_name: source.original_name,
          relevance: source.relevance,
          excerpt: source.excerpt
        })),
        catalog_size: catalog.length,
        searchable_count: searchableCount,
        retrieval_status: sources.length ? "native_full_text" : "no_match",
        note: sources.length
          ? "These excerpts are retrieved only from this user's extracted academic documents. Cite the document title and course. Bracketed text marks query matches."
          : "No matching passage was found in the extracted academic library. Do not present general knowledge as if it came from these documents; say the library did not return a source."
      };
    }

    case "delete": {
      if (!input.document_id?.trim()) throw new Error("document_id is required for academic delete.");
      await onProgress?.({ type: "tool_progress", tool: "academic", stage: "academic_delete" });
      const deleted = await deleteAcademicDocument(telegramId, input.document_id.trim());
      if (!deleted) return { deleted: false, reason: "Document not found or not owned by this user." };
      return {
        deleted: true,
        id: deleted.id,
        title: deleted.title,
        course: deleted.course,
        previous_status: deleted.status,
        file_removed: deleted.file_removed,
        note: "The document and its extracted text were removed from the native search source. Any legacy LightRAG copy is not used for normal academic answers."
      };
    }

    case "rename": {
      if (!input.document_id?.trim()) throw new Error("document_id is required for academic rename.");
      const title = input.title?.trim();
      const courseRaw = input.course;
      const courseProvided = courseRaw !== undefined;
      if (!title && !courseProvided) {
        throw new Error("rename requires a new title and/or course.");
      }
      await onProgress?.({ type: "tool_progress", tool: "academic", stage: "academic_rename" });
      const patch: { title?: string; course?: string | null } = {};
      if (title) patch.title = title;
      if (courseProvided) {
        patch.course = courseRaw === null || String(courseRaw).trim() === "" ? null : String(courseRaw).trim();
      }
      const updated = await updateAcademicDocumentMetadata(telegramId, input.document_id.trim(), patch);
      if (!updated) return { renamed: false, reason: "Document not found or not owned by this user." };
      return {
        renamed: true,
        id: updated.id,
        title: updated.title,
        course: updated.course,
        status: updated.status,
        updated_at: updated.updatedAt
      };
    }

    default:
      throw new Error(`Unknown academic operation: ${String((input as { operation?: string }).operation)}`);
  }
}
