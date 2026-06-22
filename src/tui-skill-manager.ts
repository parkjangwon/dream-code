import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import type { DreamSkill } from "./skills.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { clearRenderedLines, renderPaletteDescription } from "./tui-input-render.js";

export type SkillManagerOptions = { readonly skills: readonly DreamSkill[]; readonly disabled: readonly string[] };
export type InteractiveSkillManagerOptions = SkillManagerOptions & { readonly redrawHeader: () => void };

export type SkillManagerState = SkillManagerOptions & {
  readonly query: string;
  readonly selectedIndex: number;
};

export type SkillManagerAction =
  | { readonly kind: "up" | "down" | "toggle" | "backspace" }
  | { readonly kind: "insert"; readonly value: string };

const maxVisibleSkills = 12;

export function createSkillManagerState(
  skills: readonly DreamSkill[],
  disabled: readonly string[],
): SkillManagerState {
  return { skills, disabled: normalizeDisabled(disabled), query: "", selectedIndex: 0 };
}

export function reduceSkillManagerState(
  state: SkillManagerState,
  action: SkillManagerAction,
): SkillManagerState {
  switch (action.kind) {
    case "up":
      return clampSelected({ ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) });
    case "down":
      return clampSelected({ ...state, selectedIndex: state.selectedIndex + 1 });
    case "toggle":
      return toggleSelectedSkill(state);
    case "backspace":
      return clampSelected({ ...state, query: state.query.slice(0, -1), selectedIndex: 0 });
    case "insert":
      return clampSelected({ ...state, query: `${state.query}${action.value}`, selectedIndex: 0 });
    default:
      return assertNever(action);
  }
}

export function skillManagerVisibleSkills(state: SkillManagerState): readonly DreamSkill[] {
  const query = state.query.trim().toLowerCase();
  if (query.length === 0) {
    return state.skills;
  }
  return state.skills.filter((skill) => skillMatchesQuery(skill, query));
}

export function readInteractiveSkillManager(
  options: InteractiveSkillManagerOptions,
): Promise<readonly string[] | undefined> {
  return new Promise((resolve) => {
    let state = createSkillManagerState(options.skills, options.disabled);
    let renderedLines = 0;
    const previousRawMode = input.isRaw;

    const render = (): void => {
      clearRenderedLines(renderedLines);
      renderedLines = renderSkillManagerView(state);
    };

    const finish = (value: readonly string[] | undefined): void => {
      clearRenderedLines(renderedLines);
      cleanup();
      resolve(value);
    };

    const onKeypress = (value: string | undefined, key: Key): void => {
      if (key.ctrl === true && key.name === "l") {
        options.redrawHeader();
        renderedLines = 0;
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish(normalizeDisabled(state.disabled));
        return;
      }
      if (key.name === "escape" || (key.ctrl === true && key.name === "c")) {
        finish(undefined);
        return;
      }

      const action = skillManagerActionForKey(value, key);
      if (action === undefined) {
        return;
      }
      state = reduceSkillManagerState(state, action);
      render();
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    render();
  });
}

function renderSkillManagerView(state: SkillManagerState): number {
  const width = Math.max(72, output.columns ?? 80);
  const contentWidth = Math.min(width, 140);
  const visible = skillManagerVisibleSkills(state);
  const enabledCount = state.skills.filter((skill) => !state.disabled.includes(skill.name)).length;
  const start = visibleStart(state.selectedIndex, visible.length);
  const windowed = visible.slice(start, start + maxVisibleSkills);
  const lines = [
    `${paint("Skills", ansi.accent)} ${paint(`${state.skills.length} skills · ${enabledCount} enabled`, ansi.dim)}`,
    `${paint("Search:", ansi.guide)} ${state.query}`,
    paint("↑/↓ navigate · type to search · space toggle · enter save · esc discard", ansi.guide),
    paint("─".repeat(contentWidth), ansi.guide),
    `${paint("state", ansi.dim)}  ${paint("skill", ansi.dim).padEnd(30)} ${paint("source", ansi.dim).padEnd(12)} ${paint("description", ansi.dim)}`,
  ];

  for (let index = 0; index < windowed.length; index += 1) {
    const skill = windowed[index];
    if (skill !== undefined) {
      lines.push(formatManagedSkillLine(skill, state, start + index === state.selectedIndex, contentWidth));
    }
  }
  if (visible.length === 0) {
    lines.push(paint("No matching skills", ansi.yellow));
  }
  if (visible.length > maxVisibleSkills) {
    lines.push(paint(scrollHint(start, visible.length), ansi.guide));
  }
  lines.push(paint("─".repeat(contentWidth), ansi.guide));
  lines.push(paint("Disabled skills are hidden from / autocomplete after saving.", ansi.guide));
  output.write(lines.join("\n"));
  moveCursorToSearchLine(lines.length, state.query);
  return lines.length;
}

function formatManagedSkillLine(
  skill: DreamSkill,
  state: SkillManagerState,
  selected: boolean,
  width: number,
): string {
  const enabled = !state.disabled.includes(skill.name);
  const marker = selected ? paint(">", ansi.accent) : " ";
  const checkbox = enabled ? paint("[v]", ansi.green) : paint("[ ]", ansi.yellow);
  const name = padVisible(paint(`@${renderPaletteDescription(skill.name, 24)}`, ansi.blue), 28);
  const source = padVisible(paint(skill.source, ansi.dim), 10);
  const prefix = `${marker} ${checkbox} ${name} ${source} `;
  const description = renderPaletteDescription(skill.description, width - terminalVisibleWidth(prefix));
  return `${prefix}${paint(description, ansi.dim)}`;
}

function skillManagerActionForKey(
  value: string | undefined,
  key: Key,
): SkillManagerAction | undefined {
  switch (key.name) {
    case "up":
      return { kind: "up" };
    case "down":
      return { kind: "down" };
    case "space":
      return { kind: "toggle" };
    case "backspace":
    case "delete":
      return { kind: "backspace" };
    default:
      break;
  }
  if (value === " ") {
    return { kind: "toggle" };
  }
  if (key.ctrl === true || key.meta === true || value === undefined || value.length === 0) {
    return undefined;
  }
  return { kind: "insert", value };
}

function toggleSelectedSkill(state: SkillManagerState): SkillManagerState {
  const selected = skillManagerVisibleSkills(state)[state.selectedIndex];
  if (selected === undefined) {
    return state;
  }
  const disabled = new Set(state.disabled);
  if (disabled.has(selected.name)) {
    disabled.delete(selected.name);
  } else {
    disabled.add(selected.name);
  }
  return { ...state, disabled: normalizeDisabled([...disabled]) };
}

function skillMatchesQuery(skill: DreamSkill, query: string): boolean {
  return `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(query);
}

function clampSelected(state: SkillManagerState): SkillManagerState {
  const visibleCount = skillManagerVisibleSkills(state).length;
  return {
    ...state,
    selectedIndex: Math.max(0, Math.min(state.selectedIndex, Math.max(0, visibleCount - 1))),
  };
}

function visibleStart(selectedIndex: number, visibleCount: number): number {
  return Math.max(0, Math.min(selectedIndex, visibleCount - maxVisibleSkills));
}

function scrollHint(start: number, visibleCount: number): string {
  const remaining = Math.max(0, visibleCount - start - maxVisibleSkills);
  return remaining > 0 ? `↓ ${remaining} more below` : "↑ more above";
}

function moveCursorToSearchLine(lineCount: number, query: string): void {
  const linesToSearch = searchCursorUpCount(lineCount);
  if (linesToSearch > 0) {
    output.write(`\u001B[${linesToSearch}A`);
  }
  output.write("\r");
  output.write(`\u001B[${8 + terminalVisibleWidth(query)}C`);
}

export function searchCursorUpCount(lineCount: number): number {
  return Math.max(0, lineCount - 2);
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

function normalizeDisabled(disabled: readonly string[]): readonly string[] {
  return [...new Set(disabled)].sort();
}

function assertNever(value: never): never {
  throw new Error(`Unexpected skill manager action: ${String(value)}`);
}
