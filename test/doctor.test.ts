import test from "node:test";
import assert from "node:assert/strict";

import { summarizeDoctor } from "../src/doctor.js";

test("summarizeDoctor includes required and optional tools", () => {
  const summary = summarizeDoctor([
    { name: "node", required: true, available: true, detail: "v24" },
    { name: "rg", required: false, available: false, detail: "missing" },
  ]);

  assert.match(summary, /node/);
  assert.match(summary, /rg/);
  assert.match(summary, /fallback/i);
});
