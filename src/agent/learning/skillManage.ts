import {
  acceptLearnedSkill,
  deprecateLearnedSkill,
  getLearnedSkill,
  listLearnedSkills,
  patchLearnedSkill,
  proposeLearnedSkill
} from "./store.js";
import type { SkillProposal, TrajectoryDomain } from "./types.js";

export type SkillManageArgs = {
  operation: "list" | "get" | "propose" | "patch" | "accept" | "deprecate";
  name?: string;
  description?: string;
  body?: string;
  domain?: TrajectoryDomain;
  rationale?: string;
  id?: string;
  approved?: boolean;
  /** Internal: set by review hook when proposing from a trajectory */
  sourceTrajectoryId?: string;
};

const MUTATING = new Set(["propose", "patch", "accept", "deprecate"]);

export async function skillManageTool(
  telegramId: string,
  args: SkillManageArgs
): Promise<Record<string, unknown>> {
  const { operation } = args;

  if (MUTATING.has(operation) && args.approved !== true) {
    return {
      error: "This skill_manage operation changes skill state and requires explicit approval.",
      requires_approval: true,
      operation
    };
  }

  switch (operation) {
    case "list": {
      const skills = await listLearnedSkills(telegramId);
      return {
        count: skills.length,
        skills: skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          domain: s.domain,
          status: s.status,
          successCount: s.successCount,
          updatedAt: s.updatedAt.toISOString()
        }))
      };
    }

    case "get": {
      if (!args.id) return { error: "id is required for get." };
      const skill = await getLearnedSkill(telegramId, args.id);
      if (!skill) return { error: "Skill not found." };
      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        domain: skill.domain,
        status: skill.status,
        successCount: skill.successCount,
        body: skill.body,
        rationale: skill.metadata.rationale ?? skill.metadata.lastPatchRationale,
        createdAt: skill.createdAt.toISOString(),
        updatedAt: skill.updatedAt.toISOString(),
        acceptedAt: skill.acceptedAt?.toISOString() ?? null
      };
    }

    case "propose": {
      if (!args.name || !args.description || !args.body) {
        return { error: "name, description, and body are required to propose a skill." };
      }
      const proposal: SkillProposal = {
        name: args.name,
        description: args.description,
        body: args.body,
        domain: args.domain ?? "general",
        sourceTrajectoryId: args.sourceTrajectoryId ?? "",
        rationale: args.rationale ?? "Proposed by skill_manage."
      };
      const result = await proposeLearnedSkill(telegramId, proposal);
      if ("error" in result) return result;
      return {
        status: "proposed",
        id: result.id,
        name: result.name,
        message: "Skill proposed. User can accept it to activate."
      };
    }

    case "patch": {
      if (!args.id) return { error: "id is required for patch." };
      const result = await patchLearnedSkill(telegramId, args.id, {
        description: args.description,
        body: args.body,
        domain: args.domain,
        rationale: args.rationale
      });
      if ("error" in result) return result;
      return {
        status: "patched",
        id: result.id,
        name: result.name,
        message: "Skill updated."
      };
    }

    case "accept": {
      if (!args.id) return { error: "id is required for accept." };
      const result = await acceptLearnedSkill(telegramId, args.id);
      if ("error" in result) return result;
      return {
        status: "active",
        id: result.id,
        name: result.name,
        message: "Skill accepted and now active."
      };
    }

    case "deprecate": {
      if (!args.id) return { error: "id is required for deprecate." };
      const result = await deprecateLearnedSkill(telegramId, args.id);
      if ("error" in result) return result;
      return {
        status: "deprecated",
        id: result.id,
        name: result.name,
        message: "Skill deprecated."
      };
    }

    default:
      return { error: `Unknown skill_manage operation: ${operation}` };
  }
}
