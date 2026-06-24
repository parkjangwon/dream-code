import assert from "node:assert/strict";
import test from "node:test";

import { formatPermissionPreview } from "../src/agent-tool-permission-preview.js";

test("formatPermissionPreview renders bounded edit and shell risk details", () => {
  const edit = formatPermissionPreview({
    tool: "edit",
    path: "src/index.ts",
    search: "before line\n",
    replace: "after line\n",
  });
  const shell = formatPermissionPreview({ tool: "shell", command: "npm test" });

  assert.match(edit, /preview: edit src\/index\.ts/u);
  assert.match(edit, /old: before line/u);
  assert.match(edit, /new: after line/u);
  assert.match(shell, /target: shell/u);
  assert.match(shell, /command: npm test/u);
  assert.match(shell, /risk: external command can install packages or change machine state/u);
});
