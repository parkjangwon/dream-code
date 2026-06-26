#!/usr/bin/env node
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const result = await build({
  absWorkingDir: root,
  bundle: true,
  entryPoints: ["src/remote-web-app.tsx"],
  format: "iife",
  jsx: "automatic",
  jsxImportSource: "preact",
  logLevel: "silent",
  minify: true,
  platform: "browser",
  target: "es2020",
  write: false,
});

const script = result.outputFiles?.[0]?.text;
if (script === undefined) {
  throw new Error("remote web bundle was not generated");
}

mkdirSync(join(root, "dist/src"), { recursive: true });
writeFileSync(join(root, "dist/src", "remote-web-app.bundle.js"), script);
cpSync(join(root, "src/remote-web.css"), join(root, "dist/src", "remote-web.css"));
cpSync(join(root, "src/assets"), join(root, "dist/src/assets"), { recursive: true });
