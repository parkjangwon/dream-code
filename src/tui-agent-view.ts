import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import type { AgentBoardRow } from "./agent-board.js";
import type { AgentDefinition } from "./agent-library.js";
import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { clearRenderedLines, renderPaletteDescription } from "./tui-input-render.js";
import {
  activeAgentRows,
  createAgentViewState,
  updateAgentView,
  type AgentViewOptions,
  type AgentViewResult,
  type AgentViewState,
  type AgentViewTab,
} from "./tui-agent-view-state.js";

export type { AgentViewOptions, AgentViewResult, AgentViewState } from "./tui-agent-view-state.js";

export type InteractiveAgentViewOptions = AgentViewOptions & {
  readonly redrawHeader: () => void;
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
  return state.tab === "running" ? runningLines(activeAgentRows(state.rows), state.selectedIndex, width) : libraryLines(state.agents);
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
