import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { loadSkillSettings, skillEnabled, toggleSkill } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";
import { terminalVisibleWidth } from "./terminal-width.js";
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

  output.write(formatSkillList(skills, settings.disabled, output.columns ?? 100));
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

export function formatSkillList(
  skills: readonly DreamSkill[],
  disabled: readonly string[],
  width = 100,
): string {
  const disabledSet = new Set(disabled);
  const enabledCount = skills.filter((skill) => !disabledSet.has(skill.name)).length;
  const contentWidth = Math.max(72, Math.min(width, 140));
  const lines = [
    `${paint("Skills", ansi.accent)} ${paint(`${skills.length} installed · ${enabledCount} enabled`, ansi.dim)}\n`,
    `${paint("type @ to insert · /skills > Enable/Disable to manage", ansi.guide)}\n`,
    `${paint("─".repeat(contentWidth), ansi.guide)}\n`,
    `${paint("state", ansi.dim)}  ${paint("skill", ansi.dim).padEnd(30)} ${paint("source", ansi.dim).padEnd(12)} ${paint("description", ansi.dim)}\n`,
  ];
  for (const skill of skills) {
    lines.push(formatSkillRow(skill, disabledSet, contentWidth));
  }
  lines.push(`${paint("─".repeat(contentWidth), ansi.guide)}\n`);
  lines.push(`${paint("enter inserts from @ autocomplete · esc closes menus · disabled skills are hidden from @", ansi.guide)}\n`);
  return lines.join("");
}

function formatSkillRow(skill: DreamSkill, disabledSet: ReadonlySet<string>, width: number): string {
  const enabled = !disabledSet.has(skill.name);
  const state = enabled ? paint("on ", ansi.green) : paint("off", ansi.yellow);
  const name = padVisible(paint(`@${truncateVisible(skill.name, 24)}`, ansi.blue), 28);
  const source = padVisible(paint(skill.source, ansi.dim), 10);
  const prefix = `  ${state}  ${name} ${source} `;
  const description = truncateVisible(skill.description, width - terminalVisibleWidth(prefix));
  return `${prefix}${description}\n`;
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

function truncateVisible(text: string, width: number): string {
  if (width <= 1) {
    return "";
  }
  if (terminalVisibleWidth(text) <= width) {
    return text;
  }

  let result = "";
  for (const char of text) {
    if (terminalVisibleWidth(`${result}${char}…`) > width) {
      return `${result}…`;
    }
    result = `${result}${char}`;
  }
  return result;
}
