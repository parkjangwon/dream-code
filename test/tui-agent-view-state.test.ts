import assert from "node:assert/strict";
import test from "node:test";

import type { AgentBoardRow } from "../src/agent-board.js";
import {
  createAgentViewState,
  shouldFocusAgentViewFromInput,
  shouldReturnFromAgentView,
  updateAgentView,
} from "../src/tui-agent-view-state.js";

const workingRow: AgentBoardRow = {
  id: "run-1",
  runId: "run-1",
  group: "working",
  status: "WORKING",
  name: "Code Reviewer",
  age: "4s",
  inboxCount: 0,
  summary: "Reviewing the branch.",
  prompt: "review branch",
};

test("shouldFocusAgentViewFromInput opens from idle bottom input only when agents are active", () => {
  const options = { rows: [workingRow], agents: [] };

  assert.equal(shouldFocusAgentViewFromInput({ text: "", historyIndex: undefined, palette: undefined }, options), true);
  assert.equal(shouldFocusAgentViewFromInput({ text: "draft", historyIndex: undefined, palette: undefined }, options), false);
  assert.equal(shouldFocusAgentViewFromInput({ text: "", historyIndex: 0, palette: undefined }, options), false);
  assert.equal(shouldFocusAgentViewFromInput({ text: "", historyIndex: undefined, palette: { kind: "command" } }, options), false);
  assert.equal(shouldFocusAgentViewFromInput({ text: "", historyIndex: undefined, palette: undefined }, { rows: [], agents: [] }), false);
});

test("updateAgentView switches running and library tabs with arrow keys", () => {
  const running = createAgentViewState({ rows: [workingRow], agents: [] });
  const library = updateAgentView(running, undefined, { name: "right" });
  const back = updateAgentView(library.state, undefined, { name: "left" });

  assert.equal(library.state.tab, "library");
  assert.equal(back.state.tab, "running");
});

test("shouldReturnFromAgentView exits to main input from the first running row", () => {
  const state = createAgentViewState({ rows: [workingRow], agents: [] });
  const library = updateAgentView(state, undefined, { name: "right" }).state;

  assert.equal(shouldReturnFromAgentView(state, { name: "up" }), true);
  assert.equal(shouldReturnFromAgentView(library, { name: "up" }), true);
  assert.equal(shouldReturnFromAgentView(state, { name: "down" }), false);
});
