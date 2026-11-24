/** Core types for the Nally self-improvement / learning loop. */

export type TrajectoryDomain = "law" | "code" | "trading" | "cross" | "general";

export type TrajectoryOutcome = "success" | "partial" | "failed";

export type LearnedSkillStatus = "proposed" | "accepted" | "active" | "deprecated";

export type TrajectoryStep = {
  tool?: string;
  summary: string;
  success: boolean;
};

export type TrajectoryRecord = {
  id: string;
  userId: string;
  conversationId?: string | null;
  requestSummary: string;
  domains: TrajectoryDomain[];
  steps: TrajectoryStep[];
  outcome: TrajectoryOutcome;
  reusable: boolean;
  skillId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type LearnedSkillRecord = {
  id: string;
  userId: string;
  name: string;
  description: string;
  body: string;
  domain: TrajectoryDomain;
  status: LearnedSkillStatus;
  successCount: number;
  sourceTrajectoryId?: string | null;
  projectId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date | null;
};

/** Payload the review process produces when it wants to propose a skill. */
export type SkillProposal = {
  name: string;
  description: string;
  body: string;
  domain: TrajectoryDomain;
  sourceTrajectoryId: string;
  rationale: string;
};
