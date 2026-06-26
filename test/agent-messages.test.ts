import assert from "node:assert/strict";
import test from "node:test";

import { createAgentMessages, formatModelRoutingContext } from "../src/agent-runner.js";
import type { DreamSkill } from "../src/skills.js";

test("createAgentMessages keeps prompts minimal for token-saving startup", () => {
  const messages = createAgentMessages("fix tests");

  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.role, "user");
  assert.equal(messages[1]?.content, "fix tests");
  assert.match(messages[0]?.content ?? "", /fast coding harness/i);
  assert.match(messages[0]?.content ?? "", /prefer completion over clarification/u);
  assert.match(messages[0]?.content ?? "", /call the research tool before asking the user/u);
  assert.match(messages[0]?.content ?? "", /Do not scrape search engines through shell/u);
  assert.match(messages[0]?.content ?? "", /verify before claiming success/u);
  assert.match(messages[0]?.content ?? "", /never claim done from inference/u);
  assert.match(messages[0]?.content ?? "", /run the narrowest relevant check/u);
  assert.match(messages[0]?.content ?? "", /Before final response after changing files/u);
  assert.match(messages[0]?.content ?? "", /review your own diff/u);
  assert.match(messages[0]?.content ?? "", /Model routing context/u);
});

test("createAgentMessages exposes sticky and fallback routing context", () => {
  const routingContext = formatModelRoutingContext([
    {
      provider: "openrouter",
      model: "z-ai/glm-5.2",
      tier: "high",
      category: "deep",
      reason: "auto sticky session model",
    },
    {
      provider: "deepseek",
      model: "deepseek-v4-pro",
      tier: "high",
      category: "deep",
      reason: "auto complexity escalation: Deep",
    },
  ]);
  const messages = createAgentMessages(
    "Continue the implementation",
    [],
    undefined,
    undefined,
    [],
    "MCP servers: none configured.",
    "Session compact: prior plan.",
    "Dream memory: none.",
    "/repo",
    [],
    "Referenced files and directories: none.",
    routingContext,
  );
  const system = messages[0]?.content ?? "";

  assert.match(system, /shared authoritative context/u);
  assert.match(system, /openrouter\/z-ai\/glm-5\.2/u);
  assert.match(system, /auto sticky session model/u);
  assert.match(system, /fallbacks: deepseek\/deepseek-v4-pro/u);
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

  const messages = createAgentMessages("/review on this diff", skills);
  const system = messages[0]?.content ?? "";

  assert.match(system, /Available Dream Code skills/u);
  assert.match(system, /review: Review code/u);
  assert.match(system, /Always list findings first/u);
  assert.doesNotMatch(system, /Unused body/u);
});

test("createAgentMessages ignores unknown skill mentions", () => {
  const skills: readonly DreamSkill[] = [
    {
      name: "review",
      description: "Review code for regressions.",
      body: "Always list findings first.",
      path: "/tmp/review/SKILL.md",
      source: "dream",
    },
  ];

  const messages = createAgentMessages("/missing on this diff", skills);
  const system = messages[0]?.content ?? "";

  assert.match(system, /none active/u);
  assert.doesNotMatch(system, /Always list findings first/u);
});

test("createAgentMessages injects a selected subagent profile", () => {
  const messages = createAgentMessages("Review this branch", [], {
    id: "code-reviewer",
    name: "Code Reviewer",
    summary: "Review changes for regressions.",
    model: "inherit",
    tools: ["read", "shell"],
    prompt: "Report findings first.",
    source: "built-in",
  });
  const system = messages[0]?.content ?? "";

  assert.match(system, /Active Dream Code subagent/u);
  assert.match(system, /Code Reviewer/u);
  assert.match(system, /Report findings first\./u);
  assert.match(system, /read, shell/u);
});

test("createAgentMessages includes additional workspace directories", () => {
  const messages = createAgentMessages("inspect workspace", [], undefined, undefined, ["/repo/shared"]);
  const system = messages[0]?.content ?? "";

  assert.match(system, /Additional workspace directories/u);
  assert.match(system, /\/repo\/shared/u);
});

test("createAgentMessages injects mentioned file context", () => {
  const messages = createAgentMessages(
    "Explain @src/auth.ts",
    [],
    undefined,
    undefined,
    [],
    "MCP servers: none configured.",
    "Session compact: none.",
    "Dream memory: none.",
    "/repo",
    [],
    "Referenced files and directories:\n# @src/auth.ts (/repo/src/auth.ts)\nexport const ok = true;",
  );
  const system = messages[0]?.content ?? "";

  assert.match(system, /Referenced files and directories/u);
  assert.match(system, /export const ok = true/u);
});

test("createAgentMessages injects compact session context", () => {
  const messages = createAgentMessages(
    "continue work",
    [],
    undefined,
    undefined,
    [],
    "MCP servers: none configured.",
    "Session compact:\nPrevious decisions.",
  );
  const system = messages[0]?.content ?? "";

  assert.match(system, /Session compact/u);
  assert.match(system, /Previous decisions/u);
});

test("createAgentMessages places recent session turns before the current prompt", () => {
  const messages = createAgentMessages(
    "continue",
    [],
    undefined,
    undefined,
    [],
    "MCP servers: none configured.",
    "Session compact: none.",
    "Dream memory: none.",
    "/repo",
    [
      { role: "user", content: "Earlier request" },
      { role: "assistant", content: "Earlier answer" },
    ],
  );

  assert.deepEqual(messages.map((message) => message.role), ["system", "user", "assistant", "user"]);
  assert.equal(messages[1]?.content, "Earlier request");
  assert.equal(messages[2]?.content, "Earlier answer");
  assert.equal(messages[3]?.content, "continue");
});
