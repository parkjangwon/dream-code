import assert from "node:assert/strict";
import test from "node:test";

import { parseSwarmArgs } from "../src/tui-swarm-commands.js";

test("parseSwarmArgs keeps default swarm adaptive when options are omitted", () => {
  assert.deepEqual(parseSwarmArgs("Polish the TUI"), {
    goal: "Polish the TUI",
  });
});

test("parseSwarmArgs reads adaptive intensity presets", () => {
  assert.deepEqual(parseSwarmArgs("--deep Polish the TUI"), {
    goal: "Polish the TUI",
    intensity: "deep",
  });
});

test("parseSwarmArgs reads overdrive mode", () => {
  assert.deepEqual(parseSwarmArgs("--overdrive Polish the TUI"), {
    goal: "Polish the TUI",
    intensity: "overdrive",
  });
});

test("parseSwarmArgs reads a positional lane count after an intensity preset", () => {
  assert.deepEqual(parseSwarmArgs("--overdrive 30 프로젝트 분석해줘"), {
    goal: "프로젝트 분석해줘",
    forceLanes: 30,
    intensity: "overdrive",
  });
});

test("parseSwarmArgs allows hidden exact-lane overdrive", () => {
  assert.deepEqual(parseSwarmArgs("--lanes 25 --overdrive Audit everything"), {
    goal: "Audit everything",
    forceLanes: 25,
    intensity: "overdrive",
  });
});

test("parseSwarmArgs uses lanes as an exact forced lane count", () => {
  assert.deepEqual(parseSwarmArgs("--lanes 12 Polish the TUI"), {
    goal: "Polish the TUI",
    forceLanes: 12,
  });
});

test("parseSwarmArgs keeps size as a deprecated lanes alias", () => {
  assert.deepEqual(parseSwarmArgs("--size 999 Audit everything"), {
    goal: "Audit everything",
    forceLanes: 100,
    deprecatedSize: 100,
  });
});
