import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { learnedSkills, trajectories, users } from "../../db/schema.js";
import type {
  LearnedSkillRecord,
  LearnedSkillStatus,
  SkillProposal,
  TrajectoryDomain,
  TrajectoryOutcome,
  TrajectoryRecord,
  TrajectoryStep
} from "./types.js";
import { inferDomains, isReusableTrajectory } from "./index.js";

async function resolveUserId(telegramId: string): Promise<string | null> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return rows[0]?.id ?? null;
}

export async function recordTrajectory(input: {
  telegramId: string;
  conversationId?: string | null;
  requestSummary: string;
  steps: TrajectoryStep[];
  outcome: TrajectoryOutcome;
  metadata?: Record<string, unknown>;
}): Promise<TrajectoryRecord | null> {
  const userId = await resolveUserId(input.telegramId);
  if (!userId) return null;

  const domains = inferDomains(input.requestSummary);
  const reusable = isReusableTrajectory(input.steps, input.outcome);

  const [row] = await db
    .insert(trajectories)
    .values({
      userId,
      conversationId: input.conversationId ?? null,
      requestSummary: input.requestSummary.slice(0, 2000),
      domains,
      steps: input.steps,
      outcome: input.outcome,
      reusable,
      metadata: input.metadata ?? {}
    })
    .returning();

  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    conversationId: row.conversationId,
    requestSummary: row.requestSummary,
    domains: row.domains as TrajectoryDomain[],
    steps: row.steps as TrajectoryStep[],
    outcome: row.outcome as TrajectoryOutcome,
    reusable: row.reusable,
    skillId: row.skillId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt
  };
}

export async function listLearnedSkills(
  telegramId: string,
  status?: LearnedSkillStatus
): Promise<LearnedSkillRecord[]> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return [];

  const conditions = status
    ? and(eq(learnedSkills.userId, userId), eq(learnedSkills.status, status))
    : eq(learnedSkills.userId, userId);

  const rows = await db
    .select()
    .from(learnedSkills)
    .where(conditions)
    .orderBy(desc(learnedSkills.updatedAt))
    .limit(50);

  return rows.map(mapSkillRow);
}

export async function getLearnedSkill(telegramId: string, id: string): Promise<LearnedSkillRecord | null> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return null;

  const rows = await db
    .select()
    .from(learnedSkills)
    .where(and(eq(learnedSkills.userId, userId), eq(learnedSkills.id, id)))
    .limit(1);

  return rows[0] ? mapSkillRow(rows[0]) : null;
}

export async function proposeLearnedSkill(
  telegramId: string,
  proposal: SkillProposal
): Promise<LearnedSkillRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };

  const name = proposal.name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(name)) {
    return { error: "Skill name must be lowercase kebab-case (max 81 chars)." };
  }

  // Upsert-style: if a proposed skill with the same name exists, replace it.
  const existing = await db
    .select()
    .from(learnedSkills)
    .where(and(eq(learnedSkills.userId, userId), eq(learnedSkills.name, name)))
    .limit(1);

  if (existing[0] && existing[0].status !== "proposed") {
    return { error: `A skill named "${name}" already exists with status ${existing[0].status}. Use patch or a different name.` };
  }

  if (existing[0]) {
    const [updated] = await db
      .update(learnedSkills)
      .set({
        description: proposal.description.slice(0, 500),
        body: proposal.body.slice(0, 60_000),
        domain: proposal.domain,
        sourceTrajectoryId: proposal.sourceTrajectoryId,
        metadata: { rationale: proposal.rationale },
        updatedAt: new Date()
      })
      .where(eq(learnedSkills.id, existing[0].id))
      .returning();
    return updated ? mapSkillRow(updated) : { error: "Failed to update proposal." };
  }

  const [row] = await db
    .insert(learnedSkills)
    .values({
      userId,
      name,
      description: proposal.description.slice(0, 500),
      body: proposal.body.slice(0, 60_000),
      domain: proposal.domain,
      status: "proposed",
      sourceTrajectoryId: proposal.sourceTrajectoryId,
      metadata: { rationale: proposal.rationale }
    })
    .returning();

  return row ? mapSkillRow(row) : { error: "Failed to create proposal." };
}

export async function acceptLearnedSkill(
  telegramId: string,
  id: string
): Promise<LearnedSkillRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };

  const [row] = await db
    .update(learnedSkills)
    .set({
      status: "active",
      acceptedAt: new Date(),
      updatedAt: new Date()
    })
    .where(and(eq(learnedSkills.userId, userId), eq(learnedSkills.id, id)))
    .returning();

  return row ? mapSkillRow(row) : { error: "Skill not found." };
}

export async function deprecateLearnedSkill(
  telegramId: string,
  id: string
): Promise<LearnedSkillRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };

  const [row] = await db
    .update(learnedSkills)
    .set({
      status: "deprecated",
      updatedAt: new Date()
    })
    .where(and(eq(learnedSkills.userId, userId), eq(learnedSkills.id, id)))
    .returning();

  return row ? mapSkillRow(row) : { error: "Skill not found." };
}

export async function patchLearnedSkill(
  telegramId: string,
  id: string,
  patch: { description?: string; body?: string; domain?: TrajectoryDomain; rationale?: string }
): Promise<LearnedSkillRecord | { error: string }> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return { error: "User not found." };

  const current = await getLearnedSkill(telegramId, id);
  if (!current) return { error: "Skill not found." };
  if (current.status === "deprecated") return { error: "Cannot patch a deprecated skill." };

  const [row] = await db
    .update(learnedSkills)
    .set({
      description: patch.description?.slice(0, 500) ?? current.description,
      body: patch.body?.slice(0, 60_000) ?? current.body,
      domain: patch.domain ?? current.domain,
      metadata: {
        ...current.metadata,
        ...(patch.rationale ? { lastPatchRationale: patch.rationale } : {})
      },
      updatedAt: new Date()
    })
    .where(eq(learnedSkills.id, id))
    .returning();

  return row ? mapSkillRow(row) : { error: "Failed to patch skill." };
}

function mapSkillRow(row: typeof learnedSkills.$inferSelect): LearnedSkillRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    body: row.body,
    domain: row.domain as TrajectoryDomain,
    status: row.status as LearnedSkillStatus,
    successCount: row.successCount,
    sourceTrajectoryId: row.sourceTrajectoryId,
    projectId: row.projectId,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    acceptedAt: row.acceptedAt
  };
}
