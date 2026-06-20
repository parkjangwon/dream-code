import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { loadSkillSettings, skillEnabled, toggleSkill } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";
import type { PickerOptions } from "./tui-picker.js";

export type SkillQuestioner = {
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
};

const skillActions = {
  list: "list",
  toggle: "toggle",
} as const;

export async function showSkillMenu(configRoot: string, questioner: SkillQuestioner): Promise<void> {
  if (questioner.select === undefined) {
    await printSkillList(configRoot);
    return;
  }

  const action = await questioner.select({
    title: "Skills",
    choices: [
      { value: skillActions.list, label: "List skills", description: "Show installed skills", keywords: ["skills", "list"] },
      { value: skillActions.toggle, label: "Enable/Disable Skills", description: "Turn skills on or off", keywords: ["enable", "disable", "toggle"] },
    ],
  });

  if (action === skillActions.list) {
    await printSkillList(configRoot);
    return;
  }
  if (action === skillActions.toggle) {
    await showSkillToggle(configRoot, questioner);
  }
}

async function printSkillList(configRoot: string): Promise<void> {
  const skills = await loadSkills();
  const settings = await loadSkillSettings(configRoot);
  if (skills.length === 0) {
    output.write("no installed skills\n");
    return;
  }

  output.write(formatSkillList(skills, settings.disabled));
}

async function showSkillToggle(configRoot: string, questioner: SkillQuestioner): Promise<void> {
  const skills = await loadSkills();
  if (questioner.select === undefined || skills.length === 0) {
    await printSkillList(configRoot);
    return;
  }

  const settings = await loadSkillSettings(configRoot);
  const selected = await questioner.select({
    title: "Enable/Disable Skills",
    choices: skills.map((skill) => ({
      value: skill.name,
      label: `${skillEnabled(settings, skill.name) ? "[x]" : "[ ]"} ${skill.name}`,
      description: skill.description,
      keywords: [skill.name, skill.description, skill.source],
    })),
  });
  if (selected === undefined) {
    return;
  }
  const next = await toggleSkill(configRoot, selected);
  output.write(`${skillEnabled(next, selected) ? "enabled" : "disabled"} skill: ${selected}\n`);
}

function formatSkillList(skills: readonly DreamSkill[], disabled: readonly string[]): string {
  const disabledSet = new Set(disabled);
  const lines = [`${paint("Skills", ansi.accent)}\n`];
  for (const skill of skills) {
    const marker = disabledSet.has(skill.name) ? "[ ]" : "[x]";
    lines.push(`${marker} ${paint("@", ansi.dim)}${paint(skill.name, ansi.blue)} ${paint(skill.source, ansi.dim)} ${skill.description}\n`);
  }
  lines.push(paint("Use @skill-name in a prompt to activate a skill.", ansi.guide), "\n");
  return lines.join("");
}
