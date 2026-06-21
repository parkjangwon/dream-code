import test from "node:test";
import assert from "node:assert/strict";

import {
  parseReasoningEffort,
  resolveReasoningEffort,
} from "../src/reasoning-effort.js";

test("parseReasoningEffort accepts concise user aliases", () => {
  assert.equal(parseReasoningEffort("x-high"), "xhigh");
  assert.equal(parseReasoningEffort("med"), "medium");
  assert.equal(parseReasoningEffort("off"), "auto");
  assert.equal(parseReasoningEffort("wild"), undefined);
});

test("resolveReasoningEffort only applies supported provider and model combinations", () => {
  assert.equal(resolveReasoningEffort("openai", "responses", "gpt-5.2", "xhigh"), "xhigh");
  assert.equal(resolveReasoningEffort("openai", "responses", "gpt-5.1", "none"), "none");
  assert.equal(resolveReasoningEffort("openai", "responses", "gpt-5-pro", "xhigh"), undefined);
  assert.equal(resolveReasoningEffort("openai", "responses", "gpt-5-pro", "high"), "high");
  assert.equal(resolveReasoningEffort("deepseek", "chat-completions", "deepseek-v4-pro", "high"), undefined);
  assert.equal(resolveReasoningEffort("openai", "chat-completions", "gpt-5.2", "high"), undefined);
});
