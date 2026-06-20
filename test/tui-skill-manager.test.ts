import assert from "node:assert/strict";
import test from "node:test";

import type { DreamSkill } from "../src/skills.js";
import {
  createSkillManagerState,
  reduceSkillManagerState,
  searchCursorUpCount,
  skillManagerVisibleSkills,
} from "../src/tui-skill-manager.js";

const skills: readonly DreamSkill[] = [
  skill("cso", "Security audit."),
  skill("slidev", "Create web slides."),
  skill("review", "Review work."),
];

test("skill manager filters by typed search", () => {
  const state = reduceSkillManagerState(
    reduceSkillManagerState(createSkillManagerState(skills, []), { kind: "insert", value: "s" }),
    { kind: "insert", value: "l" },
  );

  assert.deepEqual(skillManagerVisibleSkills(state).map((skillItem) => skillItem.name), ["slidev"]);
});

test("skill manager toggles the focused visible skill", () => {
  const filtered = ["r", "e", "v"].reduce(
    (state, value) => reduceSkillManagerState(state, { kind: "insert", value }),
    createSkillManagerState(skills, []),
  );
  const toggled = reduceSkillManagerState(filtered, { kind: "toggle" });

  assert.deepEqual(toggled.disabled, ["review"]);
});

test("skill manager preserves disabled names outside the installed list", () => {
  const toggled = reduceSkillManagerState(createSkillManagerState(skills, ["external"]), { kind: "toggle" });

  assert.deepEqual(toggled.disabled, ["cso", "external"]);
});

test("skill manager keeps the search cursor on the second rendered line", () => {
  assert.equal(searchCursorUpCount(12), 10);
});

function skill(name: string, description: string): DreamSkill {
  return {
    name,
    description,
    body: description,
    path: `/tmp/${name}/SKILL.md`,
    source: "agents",
  };
}
