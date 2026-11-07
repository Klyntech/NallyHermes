import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionBudget } from "../src/agent/executionBudget.js";

test("reserves tool calls up to the hard limit", () => {
  const budget = createExecutionBudget({ maxToolCalls: 2, maxModelTurns: 4 });
  assert.equal(budget.reserveToolCall(), true);
  assert.equal(budget.reserveToolCall(), true);
  assert.equal(budget.reserveToolCall(), false);
  assert.equal(budget.snapshot().toolCalls, 2);
});

test("counts retries as separate tool-call reservations", () => {
  const budget = createExecutionBudget({ maxToolCalls: 3, maxModelTurns: 4 });
  // Initial attempt plus two retries.
  assert.equal(budget.reserveToolCall(), true);
  assert.equal(budget.reserveToolCall(), true);
  assert.equal(budget.reserveToolCall(), true);
  assert.equal(budget.reserveToolCall(), false);
});

test("reserves model turns independently from tool calls", () => {
  const budget = createExecutionBudget({ maxToolCalls: 5, maxModelTurns: 1 });
  assert.equal(budget.reserveModelTurn(), true);
  assert.equal(budget.reserveModelTurn(), false);
  assert.equal(budget.reserveToolCall(), true);
  assert.deepEqual(budget.snapshot(), {
    toolCalls: 1, modelTurns: 1, maxToolCalls: 5, maxModelTurns: 1
  });
});

test("shared budget reservations remain bounded across parallel workers", async () => {
  const budget = createExecutionBudget({ maxToolCalls: 7, maxModelTurns: 10 });
  const reservations = await Promise.all(
    Array.from({ length: 20 }, async () => budget.reserveToolCall())
  );
  assert.equal(reservations.filter(Boolean).length, 7);
  assert.equal(budget.snapshot().toolCalls, 7);
});
