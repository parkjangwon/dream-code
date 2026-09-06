import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { createCursorRowQuery, queryTerminalRows } from "../src/terminal-cursor-query.js";

const esc = "";

function fakeInput(): NodeJS.ReadStream {
  return new EventEmitter() as unknown as NodeJS.ReadStream;
}

function fakeOutput(writes: string[]): NodeJS.WriteStream {
  const emitter = new EventEmitter() as unknown as NodeJS.WriteStream;
  (emitter as unknown as { write: (chunk: string) => boolean }).write = (chunk: string) => {
    writes.push(chunk);
    return true;
  };
  return emitter;
}

test("queryRow sends the DSR request and resolves the reported row", async () => {
  const writes: string[] = [];
  const input = fakeInput();
  const output = fakeOutput(writes);
  const query = createCursorRowQuery();

  const pending = query.queryRow(input, output);
  input.emit("data", `${esc}[24;10R`);

  assert.equal(await pending, 24);
  assert.deepEqual(writes, [`${esc}[6n`]);
});

test("queryRow assembles a reply split across multiple data events", async () => {
  const input = fakeInput();
  const output = fakeOutput([]);
  const query = createCursorRowQuery();

  const pending = query.queryRow(input, output);
  input.emit("data", esc);
  input.emit("data", "[7;1R");

  assert.equal(await pending, 7);
});

test("queryRow resolves undefined when no reply arrives before the timeout", async () => {
  const input = fakeInput();
  const output = fakeOutput([]);
  const query = createCursorRowQuery();

  assert.equal(await query.queryRow(input, output, 5), undefined);
});

test("shouldSuppressKeypress only suppresses report-shaped fragments while a query is pending", async () => {
  const input = fakeInput();
  const output = fakeOutput([]);
  const query = createCursorRowQuery();

  assert.equal(query.shouldSuppressKeypress(esc, {}), false);

  const pending = query.queryRow(input, output);
  assert.equal(query.shouldSuppressKeypress(esc, {}), true);
  assert.equal(query.shouldSuppressKeypress(`${esc}[24;10R`, {}), true);
  assert.equal(query.shouldSuppressKeypress("a", {}), false);

  input.emit("data", `${esc}[24;10R`);
  await pending;

  // A short grace window after the query settles is expected — Node's keypress
  // decoder can lag the 'data' event that resolved it by a tick or more.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(query.shouldSuppressKeypress(esc, {}), false);
});

test("shouldSuppressKeypress keeps consuming a reply split into one keypress event per byte", async () => {
  const input = fakeInput();
  const output = fakeOutput([]);
  const query = createCursorRowQuery();

  const pending = query.queryRow(input, output);
  // The device that motivated this: the CPR reply arrived as one keypress event
  // per byte. A bare "2" or "5" alone doesn't look CPR-shaped by itself, but once
  // the sequence has started, every fragment up to the terminating "R" must still
  // be swallowed — otherwise those bytes get typed into the input as literal text.
  assert.equal(query.shouldSuppressKeypress(esc, {}), true);
  assert.equal(query.shouldSuppressKeypress("[", {}), true);
  assert.equal(query.shouldSuppressKeypress("2", {}), true);
  assert.equal(query.shouldSuppressKeypress("5", {}), true);
  assert.equal(query.shouldSuppressKeypress(";", {}), true);
  assert.equal(query.shouldSuppressKeypress("2", {}), true);
  assert.equal(query.shouldSuppressKeypress("0", {}), true);
  assert.equal(query.shouldSuppressKeypress("R", {}), true);
  // The terminator ends the collected sequence; unrelated typing right after
  // (not itself CPR-shaped) is no longer swallowed.
  assert.equal(query.shouldSuppressKeypress("c", {}), false);

  input.emit("data", `${esc}[25;20R`);
  await pending;
});

test("shouldSuppressKeypress still swallows a straggling reply fragment shortly after the query resolves", async () => {
  const input = fakeInput();
  const output = fakeOutput([]);
  const query = createCursorRowQuery();

  const pending = query.queryRow(input, output);
  input.emit("data", `${esc}[25;20R`);
  await pending;

  // The 'data' listener that resolved the promise can race ahead of the
  // keypress decoder delivering the same bytes as separate events.
  assert.equal(query.shouldSuppressKeypress(esc, {}), true);
  assert.equal(query.shouldSuppressKeypress("[25;20R", {}), true);
});

test("queryTerminalRows probes the bottom-right corner before asking for position", async () => {
  const writes: string[] = [];
  const input = fakeInput();
  const output = fakeOutput(writes);

  const pending = queryTerminalRows(input, output);
  input.emit("data", `${esc}[42;80R`);

  assert.equal(await pending, 42);
  assert.deepEqual(writes, [`${esc}[9999;9999H`, `${esc}[6n`]);
});
