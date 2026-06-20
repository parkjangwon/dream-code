import assert from "node:assert/strict";
import test from "node:test";

import { terminalVisibleWidth } from "../src/terminal-width.js";
import { formatSkillList } from "../src/tui-skill-commands.js";
import type { DreamSkill } from "../src/skills.js";

test("formatSkillList renders a compact non-wrapping skills table", () => {
  const skills: readonly DreamSkill[] = [
    {
      name: "i-want-go-home",
      description: "Use when the user wants to bootstrap a new project with vision and constitution, then enter an infinite autonomous development loop.",
      body: "Keep working.",
      path: "/tmp/skill/SKILL.md",
      source: "agents",
    },
  ];

  const output = formatSkillList(skills, [], 88);

  assert.match(output, /installed/u);
  assert.match(output, /@i-want-go-home/u);
  assert.equal(output.split("\n").every((line) => terminalVisibleWidth(line) <= 88), true);
});
