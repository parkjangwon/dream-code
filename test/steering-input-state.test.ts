import assert from "node:assert/strict";
import test from "node:test";

import { applySteeringInput, createSteeringInputState } from "../src/steering-input-state.js";

test("applySteeringInput queues plain text for the next turn", () => {
  const update = applySteeringInput(createSteeringInputState(), "run tests after this");

  assert.equal(update.effect.kind, "queued");
  assert.deepEqual(update.state.queue.map((item) => item.text), ["run tests after this"]);
  assert.deepEqual(update.state.steering, []);
});

test("applySteeringInput sends explicit steering immediately", () => {
  const update = applySteeringInput(createSteeringInputState(), "/steer inspect failures first");

  assert.equal(update.effect.kind, "steered");
  assert.deepEqual(update.state.steering, ["inspect failures first"]);
  assert.deepEqual(update.state.queue, []);
});

test("applySteeringInput edits, removes, and promotes queued items with text commands", () => {
  const queued = applySteeringInput(
    applySteeringInput(createSteeringInputState(), "first").state,
    "/q second",
  ).state;
  const edited = applySteeringInput(queued, "/queue edit 2 revised second").state;
  const removed = applySteeringInput(edited, "/queue rm 1").state;
  const sent = applySteeringInput(removed, "/queue send 2").state;

  assert.deepEqual(sent.queue, []);
  assert.deepEqual(sent.steering, ["revised second"]);
});

test("applySteeringInput lists queued work without mutating it", () => {
  const state = applySteeringInput(createSteeringInputState(), "queued item").state;
  const update = applySteeringInput(state, "/queue");

  assert.equal(update.effect.kind, "listed");
  assert.match(update.effect.message, /1  queued item/u);
  assert.deepEqual(update.state.queue, state.queue);
});

test("applySteeringInput accepts case-insensitive Termux-friendly queue commands", () => {
  const queued = applySteeringInput(
    applySteeringInput(createSteeringInputState(), "first").state,
    "second",
  ).state;
  const listed = applySteeringInput(queued, "Q");
  const edited = applySteeringInput(listed.state, "EDIT 2 revised");
  const removed = applySteeringInput(edited.state, "RM 1");
  const sent = applySteeringInput(removed.state, "SEND ALL");

  assert.equal(listed.effect.kind, "listed");
  assert.deepEqual(sent.state.queue, []);
  assert.deepEqual(sent.state.steering, ["revised"]);
});
