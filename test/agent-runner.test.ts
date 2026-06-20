import test from "node:test";
import assert from "node:assert/strict";

import { createAgentMessages } from "../src/agent-runner.js";
import type { DreamSkill } from "../src/skills.js";

test("createAgentMessages keeps prompts minimal for token-saving startup", () => {
  const messages = createAgentMessages("fix tests");

  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.role, "user");
  assert.equal(messages[1]?.content, "fix tests");
  assert.match(messages[0]?.content ?? "", /fast coding harness/i);
});

test("createAgentMessages injects only explicitly requested skill bodies", () => {
  const skills: readonly DreamSkill[] = [
    {
      name: "review",
      description: "Review code for regressions.",
      body: "Always list findings first.",
      path: "/tmp/review/SKILL.md",
      source: "dream",
    },
    {
      name: "docs",
      description: "Write docs.",
      body: "Unused body.",
      path: "/tmp/docs.md",
      source: "agents",
    },
  ];

  const messages = createAgentMessages("Use @review on this diff", skills);
  const system = messages[0]?.content ?? "";

  assert.match(system, /Available Dream Code skills/u);
  assert.match(system, /review: Review code/u);
  assert.match(system, /Always list findings first/u);
  assert.doesNotMatch(system, /Unused body/u);
});
