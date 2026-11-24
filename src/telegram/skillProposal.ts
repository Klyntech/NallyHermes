import { InlineKeyboard } from "grammy";

export type SkillProposalCard = {
  id: string;
  name: string;
  description: string;
  domain: string;
  rationale?: string;
};

/** Inline keyboard for proposed skills. Callback data: skill:accept|reject|edit:<id> */
export function skillProposalKeyboard(skillId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Accept", `skill:accept:${skillId}`)
    .text("Edit", `skill:edit:${skillId}`)
    .row()
    .text("Reject", `skill:reject:${skillId}`);
}

export function formatSkillProposalMessage(card: SkillProposalCard): string {
  const rationale = card.rationale ? `\nWhy: ${card.rationale.slice(0, 280)}` : "";
  return [
    "Skill proposal",
    "",
    `Name: ${card.name}`,
    `Domain: ${card.domain}`,
    `Description: ${card.description.slice(0, 400)}`,
    rationale,
    "",
    "Accept to activate · Edit to refine later · Reject to discard"
  ].join("\n");
}

export type SkillCallbackDecision = "accept" | "reject" | "edit";

export function parseSkillCallbackData(
  data: string
): { decision: SkillCallbackDecision; skillId: string } | null {
  if (!data.startsWith("skill:")) return null;
  const parts = data.split(":");
  if (parts.length < 3) return null;
  const decision = parts[1];
  if (decision !== "accept" && decision !== "reject" && decision !== "edit") return null;
  const skillId = parts.slice(2).join(":");
  if (!skillId) return null;
  return { decision, skillId };
}

export function skillCallbackAckText(decision: SkillCallbackDecision): string {
  if (decision === "accept") return "Activating skill…";
  if (decision === "reject") return "Rejecting skill…";
  return "Marked for edit…";
}

export function skillCallbackResultText(
  decision: SkillCallbackDecision,
  skillName: string
): string {
  if (decision === "accept") return `Skill activated: ${skillName}`;
  if (decision === "reject") return `Skill rejected: ${skillName}`;
  return `Edit requested for ${skillName}. Reply with the changes you want, or use skill_manage patch.`;
}
