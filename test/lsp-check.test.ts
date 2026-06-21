import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { detectDiagnosticCommands, runLspCheck } from "../src/lsp-check.js";

test("runLspCheck handles directories without TypeScript diagnostics", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-lsp-empty-"));
  try {
    const output = stripAnsi(await runLspCheck(project));

    assert.match(output, /LSP/u);
    assert.match(output, /No supported project diagnostics/u);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("detectDiagnosticCommands finds common project diagnostics", async () => {
  const project = await mkdtemp(join(tmpdir(), "dream-lsp-detect-"));
  try {
    await writeFile(join(project, "tsconfig.json"), "{}", "utf8");
    await writeFile(join(project, "Cargo.toml"), "[package]\nname=\"x\"\nversion=\"0.1.0\"\nedition=\"2021\"\n", "utf8");
    await writeFile(join(project, "go.mod"), "module example.com/x\n", "utf8");
    await writeFile(join(project, "pyproject.toml"), "[project]\nname=\"x\"\nversion=\"0.1.0\"\n", "utf8");

    const labels = (await detectDiagnosticCommands(project)).map((command) => command.label);

    assert.deepEqual(labels, ["TypeScript", "Rust", "Go", "Python"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
