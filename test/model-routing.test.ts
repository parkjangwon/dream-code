import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyPromptCategory,
  describeModelMode,
  formatRoutePreview,
  selectModelCandidatesForPrompt,
  selectModelForPrompt,
  selectSingleProviderModel,
} from "../src/model-routing.js";

test("selectSingleProviderModel returns the requested tier model", () => {
  const route = selectSingleProviderModel({
    provider: "openai",
    models: {
      low: "gpt-low",
      mid: "gpt-mid",
      high: "gpt-high",
    },
    defaultTier: "mid",
  }, "high");

  assert.equal(route.provider, "openai");
  assert.equal(route.model, "gpt-high");
  assert.equal(route.tier, "high");
});

test("describeModelMode explains single provider tier routing", () => {
  const description = describeModelMode({
    mode: "single",
    single: {
      provider: "kimi",
      models: {
        low: "kimi-fast",
        mid: "kimi-balanced",
        high: "kimi-deep",
      },
      defaultTier: "mid",
    },
    auto: { routes: [] },
  });

  assert.match(description, /single provider/i);
  assert.match(description, /kimi/);
});

test("selectModelForPrompt routes auto mode by prompt keyword", () => {
  const selected = selectModelForPrompt({
    mode: "auto",
    single: {
      provider: "openai",
      models: {
        low: "gpt-low",
        mid: "gpt-mid",
        high: "gpt-high",
      },
      defaultTier: "mid",
    },
    auto: {
      routes: [
        {
          id: "reviewer",
          provider: "kimi",
          model: "kimi-deep",
          tier: "high",
          match: ["review"],
        },
      ],
    },
  }, "review this patch");

  assert.equal(selected.provider, "kimi");
  assert.equal(selected.model, "kimi-deep");
  assert.equal(selected.reason, "auto route: reviewer");
});

test("selectModelForPrompt routes auto categories across connected providers", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "Polish this React layout and CSS", undefined, {
    connectedProviders: new Set(["openai"]),
  });

  assert.equal(selected.category, "visual");
  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.5");
  assert.equal(selected.reason, "auto category: Visual");
  assert.deepEqual(selected.skipped, ["gemini/gemini-3.5-flash", "deepseek/deepseek-v4-pro"]);
});

test("selectModelForPrompt skips disconnected category candidates", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "Implement a backend refactor", undefined, {
    connectedProviders: new Set(["openai"]),
  });

  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.3-codex");
  assert.equal(selected.category, "deep");
});

test("selectModelForPrompt skips unhealthy auto category candidates", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "Explain this repository", undefined, {
    connectedProviders: new Set(["gemini", "deepseek", "openai"]),
    unhealthyModels: new Set(["gemini/gemini-3.5-flash", "deepseek/deepseek-v4-flash"]),
  });

  assert.equal(selected.category, "reader");
  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.4-mini");
  assert.deepEqual(selected.skipped, [
    "gemini/gemini-3.5-flash unhealthy",
    "deepseek/deepseek-v4-flash unhealthy",
  ]);
});

test("selectModelCandidatesForPrompt prioritizes agent routes and keeps fallbacks", () => {
  const selected = selectModelCandidatesForPrompt(defaultAutoConfig(), "Review this patch", undefined, {
    agentId: "security-reviewer",
    connectedProviders: new Set(["deepseek", "openai"]),
  });

  assert.equal(selected[0]?.provider, "deepseek");
  assert.equal(selected[0]?.model, "deepseek-v4-pro");
  assert.equal(selected[0]?.reason, "auto agent route: security-reviewer");
  assert.equal(selected.some((candidate) => candidate.provider === "openai"), true);
});

test("selectModelCandidatesForPrompt excludes failed models for same-turn failover", () => {
  const selected = selectModelCandidatesForPrompt(defaultAutoConfig(), "Explain this repository", undefined, {
    connectedProviders: new Set(["gemini", "deepseek", "openai"]),
    excludedModels: new Set(["gemini/gemini-3.5-flash"]),
  });

  assert.equal(selected[0]?.provider, "deepseek");
  assert.equal(selected[0]?.model, "deepseek-v4-flash");
  assert.deepEqual(selected[0]?.skipped, ["gemini/gemini-3.5-flash failed"]);
});

test("classifyPromptCategory and route preview expose routing decisions", () => {
  assert.equal(classifyPromptCategory("Write release notes"), "writing");
  assert.match(formatRoutePreview(defaultAutoConfig(), "Explain this repository", {
    connectedProviders: new Set(["gemini"]),
  }), /reader -> gemini\/gemini-3\.5-flash/u);
});

function defaultAutoConfig(): Parameters<typeof selectModelForPrompt>[0] {
  return {
    mode: "auto",
    single: {
      provider: "openai",
      models: {
        low: "gpt-low",
        mid: "gpt-mid",
        high: "gpt-high",
      },
      defaultTier: "mid",
    },
    auto: {
      routes: [],
    },
  };
}
