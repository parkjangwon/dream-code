import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { createInputState } from "../src/tui-input-state.js";
import { renderRunningInputView } from "../src/tui-running-input-render.js";

test("renderRunningInputView shows queue count and text-command guidance", () => {
  const chunks: string[] = [];
  const stdout = mock.method(process.stdout, "write", (chunk: string) => {
    chunks.push(chunk);
    return true;
  });
  try {
    renderRunningInputView(createInputState([], []), 2, "", ["[AUTO routing] | dream-code"], undefined);

    const rendered = stripAnsi(chunks.join(""));
    assert.match(rendered, /\[queue 2\] >/u);
    assert.match(rendered, /Enter queue · \/steer now · \/queue edit\/rm\/send · esc esc interrupt/u);
    assert.match(rendered, /\[AUTO routing\] \| dream-code/u);
  } finally {
    stdout.mock.restore();
  }
});
