export type AgencyDomain = "law" | "code" | "trading" | "cross" | "identity" | "general";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type ClaimStatus = "open" | "supported" | "challenged" | "retracted";

export type ConstraintStrength = "hard" | "soft";

export type AgencyProject = {
  id: string;
  userId: string;
  name: string;
  domain: AgencyDomain;
  description: string;
  status: ProjectStatus;
  horizonYears?: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AgencyClaim = {
  id: string;
  userId: string;
  projectId: string;
  statement: string;
  status: ClaimStatus;
  evidenceSummary?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type AgencyConstraint = {
  id: string;
  userId: string;
  projectId?: string | null;
  /** Applies globally when projectId is null */
  statement: string;
  strength: ConstraintStrength;
  domain: AgencyDomain;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
