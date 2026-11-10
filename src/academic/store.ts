import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { academicDocuments, academicProfiles, assessments, timetableEntries, users } from "../db/schema.js";

async function getUserId(telegramId: string): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  if (!user) throw new Error("Academic user profile is not ready. Create the Telegram user first.");
  return user.id;
}

export interface AcademicProfileInput {
  programme: string;
  institution?: string;
  semester?: string;
  jurisdiction?: string;
  courses: string[];
  studyPreferences?: string;
  availability?: Record<string, unknown>;
}

export async function upsertAcademicProfile(telegramId: string, input: AcademicProfileInput) {
  const userId = await getUserId(telegramId);
  const values = {
    userId,
    programme: input.programme.trim().slice(0, 160) || "Law",
    institution: input.institution?.trim().slice(0, 240) || null,
    semester: input.semester?.trim().slice(0, 120) || null,
    jurisdiction: input.jurisdiction?.trim().slice(0, 160) || null,
    courses: [...new Set(input.courses.map((course) => course.trim()).filter(Boolean))].slice(0, 50),
    studyPreferences: input.studyPreferences?.trim().slice(0, 2000) || null,
    availability: input.availability ?? {},
    updatedAt: new Date()
  };
  const [profile] = await db.insert(academicProfiles).values(values).onConflictDoUpdate({
    target: academicProfiles.userId,
    set: values
  }).returning();
  if (!profile) throw new Error("Academic profile could not be saved.");
  return profile;
}

export async function addTimetableEntry(telegramId: string, input: { course: string; dayOfWeek: number; startTime: string; endTime: string; room?: string; lecturer?: string }) {
  const userId = await getUserId(telegramId);
  if (!input.course.trim() || input.dayOfWeek < 0 || input.dayOfWeek > 6 || !/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) {
    throw new Error("Timetable needs a course, weekday, and HH:MM start/end times.");
  }
  const [entry] = await db.insert(timetableEntries).values({
    userId,
    course: input.course.trim().slice(0, 160),
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    room: input.room?.trim().slice(0, 120) || null,
    lecturer: input.lecturer?.trim().slice(0, 160) || null
  }).returning();
  if (!entry) throw new Error("Timetable entry could not be saved.");
  return entry;
}

export async function addAssessment(telegramId: string, input: { course: string; title: string; type?: string; dueAt: string; notes?: string }) {
  const userId = await getUserId(telegramId);
  const dueAt = new Date(input.dueAt);
  if (!input.course.trim() || !input.title.trim() || !Number.isFinite(dueAt.getTime())) throw new Error("Assessment needs a course, title, and valid due date.");
  const [assessment] = await db.insert(assessments).values({
    userId,
    course: input.course.trim().slice(0, 160),
    title: input.title.trim().slice(0, 240),
    type: input.type?.trim().slice(0, 80) || "deadline",
    dueAt,
    notes: input.notes?.trim().slice(0, 2000) || null
  }).returning();
  if (!assessment) throw new Error("Assessment could not be saved.");
  return assessment;
}

export async function addAcademicDocument(telegramId: string, input: { title: string; course?: string; sourceType: string; originalName: string; filePath: string; mimeType: string; sizeBytes: number; extractedText?: string; status: string; error?: string }) {
  const userId = await getUserId(telegramId);
  const [document] = await db.insert(academicDocuments).values({
    userId,
    title: input.title.trim().slice(0, 240),
    course: input.course?.trim().slice(0, 160) || null,
    sourceType: input.sourceType.trim().slice(0, 80) || "document",
    originalName: input.originalName.trim().slice(0, 240),
    filePath: input.filePath,
    mimeType: input.mimeType.slice(0, 120),
    sizeBytes: input.sizeBytes,
    extractedText: input.extractedText?.slice(0, 2_000_000) || null,
    status: input.status,
    error: input.error?.slice(0, 1000) || null
  }).returning();
  if (!document) throw new Error("Academic document could not be recorded.");
  return document;
}

export async function getAcademicSnapshot(telegramId: string) {
  const userId = await getUserId(telegramId);
  const now = new Date();
  const [profile] = await db.select().from(academicProfiles).where(eq(academicProfiles.userId, userId)).limit(1);
  const documents = await db.select({ id: academicDocuments.id, title: academicDocuments.title, course: academicDocuments.course, originalName: academicDocuments.originalName, status: academicDocuments.status, createdAt: academicDocuments.createdAt }).from(academicDocuments).where(eq(academicDocuments.userId, userId)).orderBy(asc(academicDocuments.createdAt)).limit(100);
  const timetable = await db.select().from(timetableEntries).where(eq(timetableEntries.userId, userId)).orderBy(asc(timetableEntries.dayOfWeek), asc(timetableEntries.startTime)).limit(100);
  const upcomingAssessments = await db.select().from(assessments).where(and(eq(assessments.userId, userId), eq(assessments.status, "open"), gte(assessments.dueAt, now))).orderBy(asc(assessments.dueAt)).limit(20);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay();
  const todaysTimetable = timetable.filter((entry) => entry.dayOfWeek === dayOfWeek);
  return { profile: profile ?? null, documents, timetable, todaysTimetable, upcomingAssessments, counts: { documents: documents.length, timetable: timetable.length, assessments: upcomingAssessments.length } };
}
