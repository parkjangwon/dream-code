import type { DreamSkill } from "./skills.js";
import type { SlashCommand } from "./tui-commands.js";

export type CommandPaletteState = {
  readonly kind: "command";
  readonly matches: readonly SlashCommand[];
  readonly selectedIndex: number;
};

export type SkillPaletteState = {
  readonly kind: "skill";
  readonly matches: readonly DreamSkill[];
  readonly selectedIndex: number;
  readonly tokenStart: number;
};

export type PaletteState = CommandPaletteState | SkillPaletteState;

export function paletteFor(
  text: string,
  commands: readonly SlashCommand[],
  skills: readonly DreamSkill[],
  cursor = text.length,
): PaletteState | undefined {
  const skillPalette = skillPaletteFor(text, skills, cursor);
  if (skillPalette !== undefined) {
    return skillPalette;
  }

  if (!text.startsWith("/") || /\s/u.test(text)) {
    return undefined;
  }
  const matches = commands.filter((command) => command.name.startsWith(text));
  return matches.length === 0 ? undefined : { kind: "command", matches, selectedIndex: 0 };
}

export function movePalette(palette: PaletteState, direction: "up" | "down"): PaletteState {
  const lastIndex = palette.matches.length - 1;
  const selectedIndex =
    direction === "up"
      ? Math.max(0, palette.selectedIndex - 1)
      : Math.min(lastIndex, palette.selectedIndex + 1);

  return { ...palette, selectedIndex };
}

export function selectedPaletteCommand(palette: PaletteState | undefined): SlashCommand | undefined {
  return palette?.kind === "command" ? palette.matches[palette.selectedIndex] : undefined;
}

export function selectedPaletteSkill(palette: PaletteState | undefined): DreamSkill | undefined {
  return palette?.kind === "skill" ? palette.matches[palette.selectedIndex] : undefined;
}

function skillPaletteFor(
  text: string,
  skills: readonly DreamSkill[],
  cursor: number,
): SkillPaletteState | undefined {
  const tokenStart = text.lastIndexOf("@", cursor - 1);
  if (tokenStart < 0 || tokenStart > cursor) {
    return undefined;
  }

  const token = text.slice(tokenStart, cursor);
  if (!/^@[a-zA-Z0-9._-]*$/u.test(token)) {
    return undefined;
  }

  const query = token.slice(1).toLowerCase();
  const matches = skills.filter((skill) => skillMatchesQuery(skill, query));
  return matches.length === 0 ? undefined : { kind: "skill", matches, selectedIndex: 0, tokenStart };
}

function skillMatchesQuery(skill: DreamSkill, query: string): boolean {
  return query.length === 0
    || skill.name.includes(query)
    || skill.description.toLowerCase().includes(query);
}
