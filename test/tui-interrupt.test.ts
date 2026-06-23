import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatGuardedRunningOutput, nextEscInterruptState } from "../src/tui-interrupt.js";
import { registerActor } from "../src/actor-store.js";
import { drainInboxMessages } from "../src/inbox-store.js";
import {
  initialRunningInputState,
  parseRunningCommand,
  queueReplyMessage,
  queueSteeringMessage,
  reduceRunningInputState,
} from "../src/tui-running-command.js";

test("nextEscInterruptState requires two escape presses inside the interrupt window", () => {
  const first = nextEscInterruptState({}, 1_000);
  const second = nextEscInterruptState(first.state, 2_000);

  assert.equal(first.effect, "arm");
  assert.equal(second.effect, "abort");
});

test("nextEscInterruptState rearms when the second escape is too late", () => {
  const first = nextEscInterruptState({}, 1_000);
  const second = nextEscInterruptState(first.state, 3_000);

  assert.equal(first.effect, "arm");
  assert.equal(second.effect, "arm");
});

test("parseRunningCommand treats plain text as steering and recognizes running commands", () => {
  assert.deepEqual(parseRunningCommand("focus on the TUI first"), {
    kind: "steer",
    text: "focus on the TUI first",
    priority: false,
  });
  assert.deepEqual(parseRunningCommand("/steer use smaller edits"), {
    kind: "steer",
    text: "use smaller edits",
    priority: false,
  });
  assert.deepEqual(parseRunningCommand("/steer! stop and reprioritize"), {
    kind: "steer",
    text: "stop and reprioritize",
    priority: true,
  });
  assert.deepEqual(parseRunningCommand("/agents"), { kind: "agents" });
  assert.deepEqual(parseRunningCommand("/status"), { kind: "status" });
  assert.deepEqual(parseRunningCommand("/interrupt"), { kind: "interrupt" });
  assert.deepEqual(parseRunningCommand("/reply actor-1 check logs"), {
    kind: "reply",
    actorId: "actor-1",
    text: "check logs",
  });
});

test("reduceRunningInputState edits and submits a running command line", () => {
  let state = initialRunningInputState();
  state = reduceRunningInputState(state, "abc", {}).state;
  state = reduceRunningInputState(state, undefined, { name: "left" }).state;
  state = reduceRunningInputState(state, "X", {}).state;

  assert.equal(state.buffer, "abXc");
  assert.equal(state.cursor, 3);

  const cleared = reduceRunningInputState(state, undefined, { ctrl: true, name: "u" });
  assert.equal(cleared.state.buffer, "c");
  assert.equal(cleared.state.cursor, 0);

  const submitted = reduceRunningInputState({ buffer: "/status", cursor: 7 }, "\r", { name: "return" });
  assert.deepEqual(submitted.effect, { kind: "submit", command: { kind: "status" } });
  assert.equal(submitted.state.buffer, "");
});

test("formatGuardedRunningOutput keeps agent output off the running input line", () => {
  const rendered = formatGuardedRunningOutput("Tool read src/tui.ts\n", {
    buffer: "/agents",
    cursor: 7,
  });

  assert.match(rendered, /^\r\u001B\[2K/u);
  assert.match(rendered, /Tool read src\/tui\.ts\n/u);
  assert.match(rendered, /running >.*\/agents/u);
  assert.doesNotMatch(rendered, /\/agentsTool read/u);
});

test("formatGuardedRunningOutput uses a reserved bottom input row when terminal height is known", () => {
  const rendered = formatGuardedRunningOutput("Tool read src/tui.ts\n", {
    buffer: "/agents",
    cursor: 7,
  }, 24);

  assert.match(rendered, /^\u001B\[23;1H/u);
  assert.match(rendered, /\u001B\[24;1H\r\u001B\[2K/u);
  assert.match(rendered, /running >.*\/agents/u);
  assert.doesNotMatch(rendered, /\/agentsTool read/u);
});

test("queueSteeringMessage sends to the current running main actor inbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-running-steer-"));
  try {
    await registerActor(root, {
      id: "other-main",
      role: "main",
      name: "Other",
      task: "other session",
      sessionId: "session-other",
    });
    const current = await registerActor(root, {
      id: "current-main",
      role: "main",
      name: "Dream",
      task: "current session",
      sessionId: "session-current",
    });

    const target = await queueSteeringMessage(root, "session-current", "prioritize tests", true);
    assert.equal(target?.actor.id, current.id);

    const messages = await drainInboxMessages(root, current.id);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "system");
    assert.match(messages[0]?.content ?? "", /Priority steering/u);
    assert.match(messages[0]?.content ?? "", /prioritize tests/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("queueReplyMessage sends to an explicit actor inbox", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-running-reply-"));
  try {
    const actor = await registerActor(root, {
      id: "lane-1",
      role: "subagent",
      name: "Reviewer",
      task: "review",
    });

    const target = await queueReplyMessage(root, "lane-1", "also inspect docs");
    assert.equal(target?.actor.id, actor.id);

    const messages = await drainInboxMessages(root, actor.id);
    assert.equal(messages[0]?.content, "also inspect docs");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
