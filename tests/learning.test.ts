import assert from "node:assert/strict";
import test from "node:test";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.NVIDIA_NIM_API_KEY = "test-nim-key";
process.env.DATABASE_URL = "postgres://localhost/test";
process.env.WEBHOOK_URL = "https://example.com/webhook";
process.env.WEBHOOK_SECRET = "test-webhook-secret-32-characters-long";

const { isReusableTrajectory, inferDomains } = await import("../src/agent/learning/index.js");
const { extractTrajectorySteps } = await import("../src/agent/learning/trajectoryLogger.js");
const { isWriteOperation } = await import("../src/agent/approvals.js");
const {
  parseSkillCallbackData,
  formatSkillProposalMessage,
  skillCallbackResultText
} = await import("../src/telegram/skillProposal.js");

test("isReusableTrajectory requires success and at least two successful tool steps", () => {
  assert.equal(
    isReusableTrajectory(
      [
        { tool: "web_search", success: true },
        { tool: "fetch", success: true }
      ],
      "success"
    ),
    true
  );
  assert.equal(
    isReusableTrajectory([{ tool: "web_search", success: true }], "success"),
    false
  );
  assert.equal(
    isReusableTrajectory(
      [
        { tool: "web_search", success: true },
        { tool: "fetch", success: true }
      ],
      "failed"
    ),
    false
  );
  assert.equal(
    isReusableTrajectory(
      [
        { tool: "web_search", success: true },
        { tool: "file_io", success: false }
      ],
      "success"
    ),
    false
  );
});

test("inferDomains tags law, code, trading, and cross", () => {
  assert.ok(inferDomains("brief this tort case for lecture").includes("law"));
  assert.ok(inferDomains("fix the TypeScript repo PR").includes("code"));
  assert.ok(inferDomains("backtest this trading strategy drawdown").includes("trading"));
  const cross = inferDomains("law course assignment and deploy the side-project API");
  assert.ok(cross.includes("law"));
  assert.ok(cross.includes("code"));
  assert.ok(cross.includes("cross"));
  assert.deepEqual(inferDomains("hello there"), ["general"]);
});

test("extractTrajectorySteps maps tool calls and marks errors", () => {
  const messages = [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "1",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "nigerian contract law" }) }
        },
        {
          id: "2",
          type: "function",
          function: { name: "fetch", arguments: JSON.stringify({ url: "https://example.com" }) }
        }
      ]
    },
    { role: "tool", tool_call_id: "1", content: JSON.stringify({ results: [] }) },
    { role: "tool", tool_call_id: "2", content: JSON.stringify({ error: "timeout" }) }
  ] as ChatCompletionMessageParam[];

  const steps = extractTrajectorySteps(messages);
  assert.equal(steps.length, 2);
  assert.equal(steps[0]?.tool, "web_search");
  assert.equal(steps[0]?.success, true);
  assert.match(steps[0]?.summary ?? "", /web_search/);
  assert.equal(steps[1]?.tool, "fetch");
  assert.equal(steps[1]?.success, false);
});

test("skill_manage mutations are write operations; list/get are not", () => {
  assert.equal(isWriteOperation("skill_manage", { operation: "propose" }), true);
  assert.equal(isWriteOperation("skill_manage", { operation: "accept" }), true);
  assert.equal(isWriteOperation("skill_manage", { operation: "deprecate" }), true);
  assert.equal(isWriteOperation("skill_manage", { operation: "list" }), false);
  assert.equal(isWriteOperation("skill_manage", { operation: "get" }), false);
});

test("parseSkillCallbackData parses accept reject edit", () => {
  assert.deepEqual(parseSkillCallbackData("skill:accept:abc-123"), {
    decision: "accept",
    skillId: "abc-123"
  });
  assert.deepEqual(parseSkillCallbackData("skill:reject:abc-123"), {
    decision: "reject",
    skillId: "abc-123"
  });
  assert.deepEqual(parseSkillCallbackData("skill:edit:abc-123"), {
    decision: "edit",
    skillId: "abc-123"
  });
  assert.equal(parseSkillCallbackData("appr:allow:xyz"), null);
  assert.equal(parseSkillCallbackData("skill:nope:xyz"), null);
});

test("formatSkillProposalMessage includes name and domain", () => {
  const text = formatSkillProposalMessage({
    id: "1",
    name: "law-web-search-protocol",
    description: "Reusable case research path",
    domain: "law",
    rationale: "Seen twice this week"
  });
  assert.match(text, /law-web-search-protocol/);
  assert.match(text, /Domain: law/);
  assert.match(text, /Accept to activate/);
});

test("skillCallbackResultText is stable", () => {
  assert.match(skillCallbackResultText("accept", "foo"), /activated: foo/);
  assert.match(skillCallbackResultText("reject", "foo"), /rejected: foo/);
  assert.match(skillCallbackResultText("edit", "foo"), /Edit requested/);
});
