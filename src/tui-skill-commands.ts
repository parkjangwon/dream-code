import { stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import { loadSkillSettings, saveSkillSettings } from "./skill-settings.js";
import { loadSkills, type DreamSkill } from "./skills.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import type { SkillManagerOptions } from "./tui-skill-manager.js";

export type SkillQuestioner = {
  readonly manageSkills?: (options: SkillManagerOptions) => Promise<readonly string[] | undefined>;
};

export async function showSkillMenu(configRoot: string, questioner: SkillQuestioner): Promise<void> {
  const skills = await loadSkills();
  const settings = await loadSkillSettings(configRoot);
  if (skills.length === 0) {
    output.write("no installed skills\n");
    return;
  }

  if (questioner.manageSkills === undefined) {
    output.write(formatSkillList(skills, settings.disabled, output.columns ?? 100));
    return;
  }

  const disabled = await questioner.manageSkills({ skills, disabled: settings.disabled });
  if (disabled === undefined) {
    return;
  }
  await saveSkillSettings(configRoot, { version: 1, disabled: [...disabled].sort() });
  output.write("skills saved\n");
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
    `${paint("type @ to insert · /skills to manage", ansi.guide)}\n`,
    `${paint("─".repeat(contentWidth), ansi.guide)}\n`,
    `${paint("state", ansi.dim)}  ${paint("skill", ansi.dim).padEnd(30)} ${paint("source", ansi.dim).padEnd(12)} ${paint("description", ansi.dim)}\n`,
  ];
  for (const skill of skills) {
    lines.push(formatSkillRow(skill, disabledSet, contentWidth));
  }
  lines.push(`${paint("─".repeat(contentWidth), ansi.guide)}\n`);
  lines.push(`${paint("↑/↓ navigate · type to search · space toggle · enter save · esc discard", ansi.guide)}\n`);
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
