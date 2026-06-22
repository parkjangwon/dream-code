import type { DreamSkill } from "./skills.js";
import type { SlashCommand } from "./tui-commands.js";
import type { FileMentionTarget } from "./file-mention-targets.js";

export type CommandPaletteState = {
  readonly kind: "command";
  readonly matches: readonly SlashCommand[];
  readonly selectedIndex: number;
};

export type FilePaletteState = {
  readonly kind: "file";
  readonly matches: readonly FileMentionTarget[];
  readonly selectedIndex: number;
  readonly tokenStart: number;
};

export type PaletteState = CommandPaletteState | FilePaletteState;

export function paletteFor(
  text: string,
  commands: readonly SlashCommand[],
  skills: readonly DreamSkill[],
  fileMentions: readonly FileMentionTarget[] = [],
  cursor = text.length,
): PaletteState | undefined {
  const mentionPalette = mentionPaletteFor(text, fileMentions, cursor);
  if (mentionPalette !== undefined) {
    return mentionPalette;
  }

  if (!text.startsWith("/") || /\s/u.test(text)) {
    return undefined;
  }
  const matches = [...commands, ...skillSlashCommands(skills)]
    .filter((command) => command.name.startsWith(text))
    .sort((left, right) => left.name.localeCompare(right.name));
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

export function selectedPaletteMentionReplacement(palette: PaletteState | undefined): string | undefined {
  if (palette?.kind === "file") {
    const file = palette.matches[palette.selectedIndex];
    return file === undefined ? undefined : `@${file.path} `;
  }
  return undefined;
}

function mentionPaletteFor(
  text: string,
  fileMentions: readonly FileMentionTarget[],
  cursor: number,
): FilePaletteState | undefined {
  const tokenStart = text.lastIndexOf("@", cursor - 1);
  if (tokenStart < 0 || tokenStart > cursor) {
    return undefined;
  }

  const token = text.slice(tokenStart, cursor);
  if (!/^@[a-zA-Z0-9._~/-]*$/u.test(token)) {
    return undefined;
  }

  const query = token.slice(1).toLowerCase();
  const fileMatches = fileMentions.filter((target) => fileMentionMatchesQuery(target, query)).slice(0, 50);
  return filePalette(fileMatches, tokenStart);
}

function filePalette(matches: readonly FileMentionTarget[], tokenStart: number): FilePaletteState | undefined {
  return matches.length === 0 ? undefined : { kind: "file", matches, selectedIndex: 0, tokenStart };
}

function fileMentionMatchesQuery(target: FileMentionTarget, query: string): boolean {
  return query.length === 0
    || target.path.toLowerCase().includes(query)
    || target.description.toLowerCase().includes(query);
}

function skillSlashCommands(skills: readonly DreamSkill[]): readonly SlashCommand[] {
  return skills.map((skill) => ({
    name: `/${skill.name}`,
    summary: `Skill · ${skill.description}`,
    acceptsArgs: true,
  }));
}
