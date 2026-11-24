import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { agencyClaims, agencyConstraints, agencyProjects, users } from "../../db/schema.js";
import type {
  AgencyClaim,
  AgencyConstraint,
  AgencyDomain,
  AgencyProject,
  ClaimStatus,
  ConstraintStrength,
  ProjectStatus
} from "./types.js";

async function resolveUserId(telegramId: string): Promise<string | null> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, telegramId)).limit(1);
  return rows[0]?.id ?? null;
}

export async function createProject(input: {
  telegramId: string;
  name: string;
  domain: AgencyDomain;
  description?: string;
  horizonYears?: number;
}): Promise<AgencyProject | { error: string }> {
  const userId = await resolveUserId(input.telegramId);
  if (!userId) return { error: "User not found." };

  const [row] = await db
    .insert(agencyProjects)
    .values({
      userId,
      name: input.name.slice(0, 200),
      domain: input.domain,
      description: (input.description ?? "").slice(0, 4000),
      horizonYears: input.horizonYears,
      status: "active"
    })
    .returning();

  return row ? mapProject(row) : { error: "Failed to create project." };
}

export async function listProjects(telegramId: string): Promise<AgencyProject[]> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return [];
  const rows = await db
    .select()
    .from(agencyProjects)
    .where(eq(agencyProjects.userId, userId))
    .orderBy(desc(agencyProjects.updatedAt))
    .limit(50);
  return rows.map(mapProject);
}

export async function addClaim(input: {
  telegramId: string;
  projectId: string;
  statement: string;
  evidenceSummary?: string;
}): Promise<AgencyClaim | { error: string }> {
  const userId = await resolveUserId(input.telegramId);
  if (!userId) return { error: "User not found." };

  const [row] = await db
    .insert(agencyClaims)
    .values({
      userId,
      projectId: input.projectId,
      statement: input.statement.slice(0, 2000),
      evidenceSummary: input.evidenceSummary?.slice(0, 4000),
      status: "open"
    })
    .returning();

  return row ? mapClaim(row) : { error: "Failed to create claim." };
}

export async function listClaims(telegramId: string, projectId: string): Promise<AgencyClaim[]> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return [];
  const rows = await db
    .select()
    .from(agencyClaims)
    .where(and(eq(agencyClaims.userId, userId), eq(agencyClaims.projectId, projectId)))
    .orderBy(desc(agencyClaims.updatedAt))
    .limit(100);
  return rows.map(mapClaim);
}

export async function addConstraint(input: {
  telegramId: string;
  statement: string;
  strength: ConstraintStrength;
  domain: AgencyDomain;
  projectId?: string;
}): Promise<AgencyConstraint | { error: string }> {
  const userId = await resolveUserId(input.telegramId);
  if (!userId) return { error: "User not found." };

  const [row] = await db
    .insert(agencyConstraints)
    .values({
      userId,
      projectId: input.projectId ?? null,
      statement: input.statement.slice(0, 2000),
      strength: input.strength,
      domain: input.domain
    })
    .returning();

  return row ? mapConstraint(row) : { error: "Failed to create constraint." };
}

export async function listConstraints(
  telegramId: string,
  projectId?: string
): Promise<AgencyConstraint[]> {
  const userId = await resolveUserId(telegramId);
  if (!userId) return [];

  const condition = projectId
    ? and(eq(agencyConstraints.userId, userId), eq(agencyConstraints.projectId, projectId))
    : and(eq(agencyConstraints.userId, userId), isNull(agencyConstraints.projectId));

  const rows = await db
    .select()
    .from(agencyConstraints)
    .where(condition)
    .orderBy(desc(agencyConstraints.updatedAt))
    .limit(50);
  return rows.map(mapConstraint);
}

/** Seed the three long-horizon paths for the law / code / trading persona if missing. */
export async function ensureDefaultProjects(telegramId: string): Promise<AgencyProject[]> {
  const existing = await listProjects(telegramId);
  if (existing.length) return existing;

  const seeds: Array<{ name: string; domain: AgencyDomain; description: string; horizonYears: number }> = [
    {
      name: "Law Path",
      domain: "law",
      description: "Seven-year path from law student to practising lawyer.",
      horizonYears: 7
    },
    {
      name: "Code Path",
      domain: "code",
      description: "Hobby development aimed at financial freedom through software.",
      horizonYears: 5
    },
    {
      name: "Trading Path",
      domain: "trading",
      description: "Personal-funds trading strategies with explicit risk constraints.",
      horizonYears: 5
    }
  ];

  const created: AgencyProject[] = [];
  for (const seed of seeds) {
    const result = await createProject({ telegramId, ...seed });
    if (!("error" in result)) created.push(result);
  }
  return created;
}

function mapProject(row: typeof agencyProjects.$inferSelect): AgencyProject {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    domain: row.domain as AgencyDomain,
    description: row.description,
    status: row.status as ProjectStatus,
    horizonYears: row.horizonYears,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapClaim(row: typeof agencyClaims.$inferSelect): AgencyClaim {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    statement: row.statement,
    status: row.status as ClaimStatus,
    evidenceSummary: row.evidenceSummary,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapConstraint(row: typeof agencyConstraints.$inferSelect): AgencyConstraint {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId,
    statement: row.statement,
    strength: row.strength as ConstraintStrength,
    domain: row.domain as AgencyDomain,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
