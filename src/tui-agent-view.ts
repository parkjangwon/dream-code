import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import type { AgentBoardRow } from "./agent-board.js";
import type { AgentDefinition } from "./agent-library.js";
import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { clearRenderedLines, renderPaletteDescription } from "./tui-input-render.js";

export type AgentViewOptions = {
  readonly rows: readonly AgentBoardRow[];
  readonly agents?: readonly AgentDefinition[];
};

export type InteractiveAgentViewOptions = AgentViewOptions & {
  readonly redrawHeader: () => void;
};

export type AgentViewResult =
  | { readonly kind: "open"; readonly row: AgentBoardRow }
  | { readonly kind: "peek"; readonly row: AgentBoardRow }
  | { readonly kind: "reply"; readonly row: AgentBoardRow }
  | { readonly kind: "stop"; readonly row: AgentBoardRow }
  | { readonly kind: "templates" }
  | { readonly kind: "close" };

type AgentViewTab = "running" | "library";

type AgentViewState = {
  readonly rows: readonly AgentBoardRow[];
  readonly agents: readonly AgentDefinition[];
  readonly selectedIndex: number;
  readonly tab: AgentViewTab;
};

export function readInteractiveAgentView(options: InteractiveAgentViewOptions): Promise<AgentViewResult> {
  return new Promise((resolve) => {
    let state = createAgentViewState(options);
    let renderedLines = 0;
    const previousRawMode = input.isRaw;
    const render = (): void => {
      clearRenderedLines(renderedLines);
      renderedLines = renderAgentView(state);
    };
    const finish = (result: AgentViewResult): void => {
      clearRenderedLines(renderedLines);
      cleanup();
      resolve(result);
    };
    const onKeypress = (value: string | undefined, key: Key): void => {
      if (key.ctrl === true && key.name === "l") {
        options.redrawHeader();
        renderedLines = 0;
        render();
        return;
      }
      const update = updateAgentView(state, value, key);
      state = update.state;
      if (update.result === undefined) {
        render();
        return;
      }
      finish(update.result);
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

export function renderAgentView(state: AgentViewState): number {
  const lines = agentViewLines(state, Math.max(80, output.columns ?? 80));
  output.write(lines.join("\n"));
  moveCursorToClearAnchor(lines.length);
  return lines.length;
}

export function agentViewLines(state: AgentViewState, width = 100): readonly string[] {
  const rule = paint("─".repeat(Math.min(width, 120)), ansi.guide);
  return [
    tabLine(state.tab),
    rule,
    ...tabBodyLines(state, width),
    "",
    paint("←/→ to switch · ↑/↓ to navigate · Enter to open · Esc to close", ansi.guide),
  ];
}

function createAgentViewState(options: AgentViewOptions): AgentViewState {
  return { rows: activeRows(options.rows), agents: options.agents ?? [], selectedIndex: 0, tab: "running" };
}

function updateAgentView(
  state: AgentViewState,
  value: string | undefined,
  key: Key,
): { readonly state: AgentViewState; readonly result?: AgentViewResult } {
  if (key.name === "escape" || (key.ctrl === true && key.name === "c")) {
    return { state, result: { kind: "close" } };
  }
  if (key.name === "left" || key.name === "right") {
    return { state: { ...state, selectedIndex: 0, tab: nextTab(state.tab) } };
  }
  if (key.name === "up" || key.name === "down") {
    return { state: moveSelection(state, key.name) };
  }
  if (key.name === "return" || key.name === "enter") {
    return enterResult(state);
  }
  if (state.tab === "running" && value === " ") {
    return rowResult(state, "reply");
  }
  if (state.tab === "running" && value === "s") {
    return rowResult(state, "stop");
  }
  if (value === "t") {
    return { state: { ...state, tab: "library", selectedIndex: 0 } };
  }
  return { state };
}

function enterResult(state: AgentViewState): { readonly state: AgentViewState; readonly result: AgentViewResult } {
  if (state.tab === "library") {
    return { state, result: { kind: "templates" } };
  }
  const row = state.rows[state.selectedIndex];
  return row === undefined ? { state, result: { kind: "close" } } : { state, result: { kind: "open", row } };
}

function rowResult(state: AgentViewState, kind: "reply" | "stop"): { readonly state: AgentViewState; readonly result?: AgentViewResult } {
  const row = state.rows[state.selectedIndex];
  return row === undefined ? { state } : { state, result: { kind, row } };
}

function moveSelection(state: AgentViewState, direction: "up" | "down"): AgentViewState {
  const maxIndex = state.tab === "running" ? Math.max(0, state.rows.length - 1) : 0;
  const delta = direction === "up" ? -1 : 1;
  return { ...state, selectedIndex: Math.min(maxIndex, Math.max(0, state.selectedIndex + delta)) };
}

function activeRows(rows: readonly AgentBoardRow[]): readonly AgentBoardRow[] {
  return rows.filter((row) => row.group !== "completed");
}

function nextTab(tab: AgentViewTab): AgentViewTab {
  return tab === "running" ? "library" : "running";
}

function tabLine(tab: AgentViewTab): string {
  return [
    paint("Agents", ansi.bold),
    tabLabel("Running", tab === "running"),
    tabLabel("Library", tab === "library"),
  ].join("  ");
}

function tabLabel(label: string, active: boolean): string {
  return active ? `${ansi.inverse}${ansi.bold}${label}${ansi.reset}` : paint(label, ansi.accent);
}

function tabBodyLines(state: AgentViewState, width: number): readonly string[] {
  return state.tab === "running" ? runningLines(activeRows(state.rows), state.selectedIndex, width) : libraryLines(state.agents);
}

function runningLines(rows: readonly AgentBoardRow[], selectedIndex: number, width: number): readonly string[] {
  if (rows.length === 0) {
    return ["", paint("No subagents are currently running.", ansi.dim)];
  }
  return ["", ...rows.map((row, index) => runningRowLine(row, index === selectedIndex, width))];
}

function runningRowLine(row: AgentBoardRow, selected: boolean, width: number): string {
  const marker = selected ? paint(">", ansi.accent) : " ";
  const inbox = row.inboxCount > 0 ? paint(`inbox ${row.inboxCount}`, ansi.yellow) : paint("inbox 0", ansi.dim);
  const prefix = `${marker} ${paint(row.name, ansi.bold)} ${paint(row.status.toLowerCase(), ansi.dim)} · ${paint(row.age, ansi.dim)} · ${inbox}  `;
  return `${prefix}${paint(renderPaletteDescription(row.summary, width - terminalVisibleWidth(prefix)), ansi.blue)}`;
}

function libraryLines(agents: readonly AgentDefinition[]): readonly string[] {
  const custom = agents.filter((agent) => agent.source !== "built-in");
  const builtIn = agents.filter((agent) => agent.source === "built-in");
  return [
    "",
    `${paint(">", ansi.accent)} ${paint("Create new agent", ansi.accent)}`,
    "",
    ...customAgentLines(custom),
    "",
    paint("Each subagent has its own context window, custom system prompt, and specific tools.", ansi.dim),
    "",
    paint("Try creating: Code Reviewer, Code Simplifier, Security Reviewer, Tech Lead, or UX Reviewer.", ansi.dim),
    "",
    paint("─".repeat(24), ansi.guide),
    "",
    paint("Built-in (always available):", ansi.dim),
    ...builtIn.map((agent) => `  ${paint(agent.id, ansi.dim)} ${paint("·", ansi.guide)} ${paint(agent.model, ansi.dim)}`),
  ];
}

function customAgentLines(agents: readonly AgentDefinition[]): readonly string[] {
  if (agents.length === 0) {
    return [paint("No agents found. Create specialized subagents that Dream can delegate to.", ansi.dim)];
  }
  return agents.map((agent) => `  ${paint(agent.name, ansi.bold)} ${paint("·", ansi.guide)} ${agent.summary}`);
}

function moveCursorToClearAnchor(lineCount: number): void {
  const linesToAnchor = Math.max(0, lineCount - 2);
  if (linesToAnchor > 0) {
    output.write(`\u001B[${linesToAnchor}A`);
  }
  output.write("\r");
}
