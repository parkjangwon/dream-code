import test from "node:test";
import assert from "node:assert/strict";

import { stripAnsi } from "../src/ansi.js";
import type { SelectedModel } from "../src/model-routing.js";
import { createAgentResponseSession } from "../src/tui-agent-response.js";

test("agent response session renders thinking, streamed rail, and done summary", () => {
  const chunks: string[] = [];
  let clock = 1_000;
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => clock,
  });

  session.start();
  session.token("Hello\nworld");
  clock = 2_250;
  session.finish();

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /○ Thinking openai\/gpt-test · mid/);
  assert.match(output, /● Dream openai\/gpt-test · mid/);
  assert.match(output, /│ Hello\n│ world\n/);
  assert.match(output, /✓ Done 1\.3s · ~3 tokens/);
});

test("agent response session renders provider errors as a response block", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.fail("Missing API key", "warn");

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /○ Thinking openai\/gpt-test · mid/);
  assert.match(output, /✕ Error/);
  assert.match(output, /│ Missing API key/);
});

const selectedModelFixture = {
  provider: "openai",
  model: "gpt-test",
  tier: "mid",
  reason: "test",
} satisfies SelectedModel;
