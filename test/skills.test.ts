import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { defaultSkillRoots, loadSkills } from "../src/skills.js";
import { loadSkillSettings, skillEnabled, toggleSkill } from "../src/skill-settings.js";

test("defaultSkillRoots includes Dream and shared agent skill directories", () => {
  const roots = defaultSkillRoots("/tmp/home");

  assert.deepEqual(roots, [
    "/tmp/home/.dream/skills",
    "/tmp/home/.agents/skills",
  ]);
});

test("loadSkills discovers directory and markdown skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-skills-"));
  try {
    const dreamRoot = join(root, ".dream", "skills");
    const agentRoot = join(root, ".agents", "skills");
    await mkdir(join(dreamRoot, "review"), { recursive: true });
    await mkdir(agentRoot, { recursive: true });
    await writeFile(
      join(dreamRoot, "review", "SKILL.md"),
      ["---", "name: review", "description: Review code.", "---", "Find bugs first."].join("\n"),
      "utf8",
    );
    await writeFile(join(agentRoot, "docs.md"), "# Docs\nWrite concise docs.", "utf8");

    const skills = await loadSkills([dreamRoot, agentRoot]);
    const review = skills.find((skill) => skill.name === "review");
    const docs = skills.find((skill) => skill.name === "docs");

    assert.equal(skills.length, 2);
    assert.equal(review?.description, "Review code.");
    assert.equal(review?.source, "dream");
    assert.equal(docs?.source, "agents");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("toggleSkill persists disabled skills in TOML", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-skill-settings-"));
  try {
    const disabled = await toggleSkill(root, "review");

    assert.equal(skillEnabled(disabled, "review"), false);
    assert.deepEqual((await loadSkillSettings(root)).disabled, ["review"]);

    const enabled = await toggleSkill(root, "review");

    assert.equal(skillEnabled(enabled, "review"), true);
    assert.deepEqual((await loadSkillSettings(root)).disabled, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
