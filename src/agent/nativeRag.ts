import { and, desc, eq, gt, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { academicDocuments, memories } from "../db/schema.js";

const MAX_ACADEMIC_RESULTS = 8;
const MAX_MEMORY_RESULTS = 8;
const MAX_MEMORY_FALLBACK_SCAN = 40;

function academicSearchVector() {
  return sql`
    setweight(to_tsvector('english', coalesce(${academicDocuments.title}, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(${academicDocuments.course}, '')), 'B') ||
    to_tsvector('english', coalesce(${academicDocuments.extractedText}, ''))
  `;
}

function memorySearchVector() {
  return sql`
    setweight(to_tsvector('english', coalesce(${memories.content}, '')), 'A') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(${memories.subject}, '') || ' ' ||
        coalesce(${memories.predicate}, '') || ' ' ||
        coalesce(${memories.object}, '')
      ),
      'B'
    )
  `;
}

/** Search only this user's extracted academic source text. No personal-memory index or web context is consulted. */
export async function searchAcademicSources(
  userId: string,
  query: string,
  course?: string
) {
  const normalizedQuery = query.trim().slice(0, 500);
  if (!normalizedQuery) return [];

  const vector = academicSearchVector();
  const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`;
  const where = [
    eq(academicDocuments.userId, userId),
    isNotNull(academicDocuments.extractedText),
    sql`numnode(${tsQuery}) > 0`,
    sql`${vector} @@ ${tsQuery}`
  ];
  const normalizedCourse = course?.trim();
  if (normalizedCourse) {
    where.push(ilike(academicDocuments.course, `%${normalizedCourse.slice(0, 100)}%`));
  }

  return db
    .select({
      document_id: academicDocuments.id,
      title: academicDocuments.title,
      course: academicDocuments.course,
      original_name: academicDocuments.originalName,
      status: academicDocuments.status,
      relevance: sql<number>`ts_rank_cd(${vector}, ${tsQuery}, 32)`,
      excerpt: sql<string>`ts_headline(
        'english',
        coalesce(${academicDocuments.extractedText}, ''),
        ${tsQuery},
        'MaxFragments=3, MaxWords=48, MinWords=12, StartSel=【, StopSel=】'
      )`
    })
    .from(academicDocuments)
    .where(and(...where))
    .orderBy(desc(sql`ts_rank_cd(${vector}, ${tsQuery}, 32)`))
    .limit(MAX_ACADEMIC_RESULTS);
}

function normalizedTokens(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 12);
}

/** Search structured memories with Postgres FTS; use a bounded token-overlap fallback for small synonym/paraphrase gaps. */
export async function searchSavedMemories(userId: string, query: string) {
  const normalizedQuery = query.trim().slice(0, 500);
  if (!normalizedQuery) return [];

  const vector = memorySearchVector();
  const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`;
  const activeMemory = or(isNull(memories.expiresAt), gt(memories.expiresAt, new Date()));
  const exact = await db
    .select({
      id: memories.id,
      content: memories.content,
      kind: memories.kind,
      subject: memories.subject,
      predicate: memories.predicate,
      object: memories.object,
      confidence: memories.confidence,
      updated_at: memories.updatedAt,
      relevance: sql<number>`ts_rank_cd(${vector}, ${tsQuery}, 32)`
    })
    .from(memories)
    .where(and(
      eq(memories.userId, userId),
      activeMemory,
      sql`numnode(${tsQuery}) > 0`,
      sql`${vector} @@ ${tsQuery}`
    ))
    .orderBy(desc(sql`ts_rank_cd(${vector}, ${tsQuery}, 32)`), desc(memories.updatedAt))
    .limit(MAX_MEMORY_RESULTS);

  if (exact.length) return exact.map((item) => ({ ...item, match_type: "full_text" as const }));

  const tokens = normalizedTokens(normalizedQuery);
  if (!tokens.length) return [];
  const candidates = await db
    .select({
      id: memories.id,
      content: memories.content,
      kind: memories.kind,
      subject: memories.subject,
      predicate: memories.predicate,
      object: memories.object,
      confidence: memories.confidence,
      updated_at: memories.updatedAt
    })
    .from(memories)
    .where(and(eq(memories.userId, userId), activeMemory))
    .orderBy(desc(memories.updatedAt))
    .limit(MAX_MEMORY_FALLBACK_SCAN);

  return candidates
    .map((item) => {
      const searchable = [item.content, item.subject, item.predicate, item.object].filter(Boolean).join(" ").toLocaleLowerCase();
      const matched = tokens.filter((token) => searchable.includes(token));
      return { ...item, relevance: matched.length / tokens.length, matched_tokens: matched.length, match_type: "token_overlap" as const };
    })
    .filter((item) => item.matched_tokens > 0)
    .sort((a, b) => b.relevance - a.relevance || b.updated_at.getTime() - a.updated_at.getTime())
    .slice(0, MAX_MEMORY_RESULTS);
}
