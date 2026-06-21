import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import {
  formatModelTelemetry,
  loadUnhealthyModelKeys,
  recordModelTelemetry,
} from "../src/model-telemetry.js";

test("model telemetry summarizes provider health and token estimates", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-telemetry-"));
  try {
    await recordModelTelemetry(root, {
      provider: "openai",
      model: "gpt-5.4-mini",
      category: "quick",
      ok: true,
      elapsedMs: 1200,
      inputChars: 400,
      outputChars: 800,
    });
    await recordModelTelemetry(root, {
      provider: "openai",
      model: "gpt-5.4-mini",
      category: "quick",
      ok: false,
      elapsedMs: 800,
      inputChars: 100,
      outputChars: 0,
      error: "Provider request failed",
    });

    const output = stripAnsi(await formatModelTelemetry(root));

    assert.match(output, /Model Health/u);
    assert.match(output, /openai\/gpt-5\.4-mini/u);
    assert.match(output, /1\/2 ok/u);
    assert.match(output, /tokens ~325/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("model telemetry exposes unhealthy model keys for auto routing", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-model-telemetry-"));
  try {
    await recordModelTelemetry(root, {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      ok: false,
      elapsedMs: 500,
      inputChars: 100,
      outputChars: 0,
      error: "HTTP 500",
    });
    await recordModelTelemetry(root, {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      ok: false,
      elapsedMs: 700,
      inputChars: 100,
      outputChars: 0,
      error: "HTTP 500",
    });
    await recordModelTelemetry(root, {
      provider: "openai",
      model: "gpt-5.4-mini",
      ok: true,
      elapsedMs: 900,
      inputChars: 100,
      outputChars: 100,
    });

    const unhealthy = await loadUnhealthyModelKeys(root, { minCalls: 2, failureRate: 0.5 });

    assert.equal(unhealthy.has("deepseek/deepseek-v4-flash"), true);
    assert.equal(unhealthy.has("openai/gpt-5.4-mini"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
