import test from "node:test";
import assert from "node:assert/strict";

import { slashCommands } from "../src/tui-commands.js";
import { createInputState, reduceInputState } from "../src/tui-input-state.js";
import type { DreamSkill } from "../src/skills.js";

const testSkills: readonly DreamSkill[] = [
  {
    name: "cso",
    description: "Chief Security Officer security audit.",
    body: "Audit security.",
    path: "/tmp/cso/SKILL.md",
    source: "agents",
  },
  {
    name: "docs",
    description: "Write docs.",
    body: "Write concise docs.",
    path: "/tmp/docs.md",
    source: "dream",
  },
];

test("slash input opens a command palette and enter submits the selected command", () => {
  const opened = reduceInputState(createInputState([], slashCommands), {
    kind: "insert",
    value: "/",
  });
  const selected = reduceInputState(opened.state, { kind: "enter" });

  assert.equal(opened.state.palette?.matches.length, slashCommands.length);
  assert.equal(selected.effect.kind, "submit");
  assert.equal(selected.effect.text, "/help");
  const names: readonly string[] = slashCommands.map((command) => command.name);
  assert.equal(names.includes("/model"), true);
  assert.equal(names.includes("/models"), false);
  assert.equal(names.includes("/provider"), true);
  assert.equal(names.includes("/providers"), false);
  assert.equal(names.includes("/agents"), true);
  assert.equal(names.includes("/session"), true);
  assert.equal(names.includes("/rename"), true);
  assert.equal(names.includes("/read"), false);
  assert.equal(names.includes("/write"), false);
  assert.equal(names.includes("/edit"), false);
  assert.equal(names.includes("/shell"), false);
  assert.equal(names.includes("/goal"), false);
  assert.equal(names.includes("/plan"), false);
  assert.equal(names.includes("/swarm"), false);
  assert.equal(names.includes("/team"), false);
  assert.equal(names.includes("/research"), false);
  assert.equal(names.includes("/lsp"), false);
  assert.equal(slashCommands.find((command) => command.name === "/model")?.summary, "Choose active model");
});

test("slash command palette uses arrow keys for selection", () => {
  const opened = reduceInputState(createInputState([], slashCommands), {
    kind: "insert",
    value: "/",
  });
  const moved = reduceInputState(opened.state, { kind: "down" });
  const selected = reduceInputState(moved.state, { kind: "enter" });

  assert.equal(moved.state.palette?.selectedIndex, 1);
  assert.equal(selected.effect.kind, "submit");
  assert.equal(selected.effect.text, "/status");
});

test("argument commands complete into the input instead of submitting", () => {
  const withPrefix = reduceInputState(createInputState([], slashCommands), {
    kind: "insert",
    value: "/mod",
  });
  const completed = reduceInputState(withPrefix.state, { kind: "enter" });

  assert.equal(completed.effect.kind, "none");
  assert.equal(completed.state.text, "/model ");
  assert.equal(completed.state.palette, undefined);
});

test("at sign opens skill autocomplete and inserts selected skill", () => {
  const opened = reduceInputState(createInputState([], slashCommands, testSkills), {
    kind: "insert",
    value: "@",
  });
  const selected = reduceInputState(opened.state, { kind: "enter" });

  assert.equal(opened.state.palette?.kind, "skill");
  assert.equal(opened.state.palette?.matches.length, 2);
  assert.equal(selected.effect.kind, "none");
  assert.equal(selected.state.text, "@cso ");
});

test("skill autocomplete filters by typed query", () => {
  const opened = reduceInputState(createInputState([], slashCommands, testSkills), {
    kind: "insert",
    value: "@do",
  });

  assert.equal(opened.state.palette?.kind, "skill");
  assert.equal(opened.state.palette?.matches[0]?.name, "docs");
});

test("history navigation restores older commands and returns to the draft", () => {
  const initial = createInputState(["/status", "/doctor"], slashCommands);
  const withDraft = reduceInputState(initial, { kind: "insert", value: "draft" });
  const previous = reduceInputState(withDraft.state, { kind: "up" });
  const older = reduceInputState(previous.state, { kind: "up" });
  const newer = reduceInputState(older.state, { kind: "down" });
  const draft = reduceInputState(newer.state, { kind: "down" });

  assert.equal(previous.state.text, "/doctor");
  assert.equal(older.state.text, "/status");
  assert.equal(newer.state.text, "/doctor");
  assert.equal(draft.state.text, "draft");
});

test("ctrl-l requests a header redraw without changing input", () => {
  const state = reduceInputState(createInputState([], slashCommands), {
    kind: "insert",
    value: "/status",
  }).state;
  const cleared = reduceInputState(state, { kind: "ctrlL" });

  assert.equal(cleared.effect.kind, "redraw");
  assert.equal(cleared.state.text, "/status");
});

test("cursor editing supports left, right, delete, home, and end", () => {
  const initial = createInputState([], slashCommands);
  const inserted = reduceInputState(initial, { kind: "insert", value: "ac" });
  const moved = reduceInputState(inserted.state, { kind: "left" });
  const fixed = reduceInputState(moved.state, { kind: "insert", value: "b" });
  const home = reduceInputState(fixed.state, { kind: "home" });
  const deleted = reduceInputState(home.state, { kind: "delete" });
  const end = reduceInputState(deleted.state, { kind: "end" });

  assert.equal(fixed.state.text, "abc");
  assert.equal(fixed.state.cursor, 2);
  assert.equal(deleted.state.text, "bc");
  assert.equal(end.state.cursor, 2);
});

test("line editing supports ctrl-u and ctrl-k style clearing", () => {
  const inserted = reduceInputState(createInputState([], slashCommands), {
    kind: "insert",
    value: "abcdef",
  });
  const left = reduceInputState(inserted.state, { kind: "left" });
  const leftAgain = reduceInputState(left.state, { kind: "left" });
  const clearedStart = reduceInputState(leftAgain.state, { kind: "clearBeforeCursor" });
  const clearedEnd = reduceInputState(clearedStart.state, { kind: "clearAfterCursor" });

  assert.equal(clearedStart.state.text, "ef");
  assert.equal(clearedStart.state.cursor, 0);
  assert.equal(clearedEnd.state.text, "");
});

test("question mark stays in the input and backspace removes it naturally", () => {
  const inserted = reduceInputState(createInputState([], slashCommands), {
    kind: "insert",
    value: "?",
  });
  const removed = reduceInputState(inserted.state, { kind: "backspace" });

  assert.equal(inserted.state.text, "?");
  assert.equal(inserted.state.cursor, 1);
  assert.equal(removed.state.text, "");
});
