import type { Key } from "node:readline";

import type { AgentBoardRow } from "./agent-board.js";
import type { AgentDefinition } from "./agent-library.js";

export type AgentViewOptions = {
  readonly rows: readonly AgentBoardRow[];
  readonly agents?: readonly AgentDefinition[];
};

export type AgentViewResult =
  | { readonly kind: "open"; readonly row: AgentBoardRow }
  | { readonly kind: "peek"; readonly row: AgentBoardRow }
  | { readonly kind: "reply"; readonly row: AgentBoardRow }
  | { readonly kind: "stop"; readonly row: AgentBoardRow }
  | { readonly kind: "templates" }
  | { readonly kind: "close" };

export type AgentViewTab = "running" | "library";

export type AgentViewState = {
  readonly rows: readonly AgentBoardRow[];
  readonly agents: readonly AgentDefinition[];
  readonly selectedIndex: number;
  readonly tab: AgentViewTab;
};

export type AgentViewUpdate = {
  readonly state: AgentViewState;
  readonly result?: AgentViewResult;
};

export function createAgentViewState(options: AgentViewOptions): AgentViewState {
  return { rows: activeAgentRows(options.rows), agents: options.agents ?? [], selectedIndex: 0, tab: "running" };
}

export function activeAgentRows(rows: readonly AgentBoardRow[]): readonly AgentBoardRow[] {
  return rows.filter((row) => row.group !== "completed");
}

export function hasActiveAgentRows(options: AgentViewOptions | undefined): boolean {
  return options !== undefined && activeAgentRows(options.rows).length > 0;
}

export function shouldFocusAgentViewFromInput(input: {
  readonly text: string;
  readonly historyIndex: number | undefined;
  readonly palette: unknown;
}, options: AgentViewOptions | undefined): boolean {
  return input.text.length === 0
    && input.historyIndex === undefined
    && input.palette === undefined
    && hasActiveAgentRows(options);
}

export function shouldReturnFromAgentView(state: AgentViewState, key: Key): boolean {
  return key.name === "up" && state.selectedIndex === 0;
}

export function updateAgentView(
  state: AgentViewState,
  value: string | undefined,
  key: Key,
): AgentViewUpdate {
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

function enterResult(state: AgentViewState): AgentViewUpdate & { readonly result: AgentViewResult } {
  if (state.tab === "library") {
    return { state, result: { kind: "templates" } };
  }
  const row = state.rows[state.selectedIndex];
  return row === undefined ? { state, result: { kind: "close" } } : { state, result: { kind: "open", row } };
}

function rowResult(state: AgentViewState, kind: "reply" | "stop"): AgentViewUpdate {
  const row = state.rows[state.selectedIndex];
  return row === undefined ? { state } : { state, result: { kind, row } };
}

function moveSelection(state: AgentViewState, direction: "up" | "down"): AgentViewState {
  const maxIndex = state.tab === "running" ? Math.max(0, state.rows.length - 1) : 0;
  const delta = direction === "up" ? -1 : 1;
  return { ...state, selectedIndex: Math.min(maxIndex, Math.max(0, state.selectedIndex + delta)) };
}

function nextTab(tab: AgentViewTab): AgentViewTab {
  return tab === "running" ? "library" : "running";
}
