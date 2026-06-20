import test from "node:test";
import assert from "node:assert/strict";

import {
  dreamTerminalTitle,
  setTerminalTitle,
  terminalTitleSequence,
} from "../src/terminal-title.js";

test("dreamTerminalTitle keeps the terminal tab concise", () => {
  assert.equal(dreamTerminalTitle, "Dream Code");
});

test("terminalTitleSequence strips control characters from titles", () => {
  assert.equal(terminalTitleSequence("Dream\u001B Code\u0007"), "\u001B]0;Dream Code\u0007");
});

test("setTerminalTitle writes only to interactive terminals", () => {
  const interactiveWrites: string[] = [];
  const pipedWrites: string[] = [];

  setTerminalTitle({ isTTY: true, write: (text) => interactiveWrites.push(text) }, "Dream Code");
  setTerminalTitle({ isTTY: false, write: (text) => pipedWrites.push(text) }, "Dream Code");

  assert.deepEqual(interactiveWrites, ["\u001B]0;Dream Code\u0007"]);
  assert.deepEqual(pipedWrites, []);
});
