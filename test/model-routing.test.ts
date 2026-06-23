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
import { bootstrapAutoModelConfig } from "../src/model-auto-bootstrap.js";
import { defaultConfig } from "../src/config.js";

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
  const selected = selectModelForPrompt(defaultAutoConfig(), "Implement a backend endpoint", undefined, {
    connectedProviders: new Set(["openai"]),
  });

  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.4-mini");
  assert.equal(selected.category, "coding");
});

test("selectModelForPrompt routes tool and file work to cheap fast models", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "Use rg to find files, read the output, then write the patch", undefined, {
    connectedProviders: new Set(["deepseek", "openai"]),
  });

  assert.equal(selected.category, "tool");
  assert.equal(selected.tier, "low");
  assert.equal(selected.provider, "deepseek");
  assert.equal(selected.model, "deepseek-v4-flash");
});

test("selectModelForPrompt keeps deep reasoning on high quality models", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["sakana"])).model;
  const selected = selectModelForPrompt(config, "Design the architecture for a complex migration algorithm", undefined, {
    connectedProviders: new Set(["sakana"]),
  });

  assert.equal(selected.category, "ultrabrain");
  assert.equal(selected.tier, "high");
  assert.equal(selected.provider, "sakana");
  assert.equal(selected.model, "fugu-ultra");
});

test("selectModelForPrompt uses OpenRouter submodels by task difficulty", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["openrouter"])).model;
  const easy = selectModelForPrompt(config, "Find files with rg and summarize command output", undefined, {
    connectedProviders: new Set(["openrouter"]),
  });
  const hard = selectModelForPrompt(config, "Design a complex algorithm and architecture for long-horizon coding", undefined, {
    connectedProviders: new Set(["openrouter"]),
  });

  assert.equal(easy.provider, "openrouter");
  assert.equal(easy.model, "deepseek/deepseek-v4-flash");
  assert.equal(hard.provider, "openrouter");
  assert.equal(hard.model, "z-ai/glm-5.2");
});

test("selectModelForPrompt ranks actual models inside a cheap provider set", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["deepseek", "openrouter"])).model;
  const easy = selectModelForPrompt(config, "Read files and find command output", undefined, {
    connectedProviders: new Set(["deepseek", "openrouter"]),
  });
  const hard = selectModelForPrompt(config, "Plan a complex architecture migration algorithm", undefined, {
    connectedProviders: new Set(["deepseek", "openrouter"]),
  });

  assert.equal(easy.provider, "deepseek");
  assert.equal(easy.model, "deepseek-v4-flash");
  assert.equal(hard.provider, "openrouter");
  assert.equal(hard.model, "z-ai/glm-5.2");
});

test("selectModelForPrompt does not let tool keywords mask architecture reasoning", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["deepseek", "openrouter"])).model;
  const selected = selectModelForPrompt(config, "Use rg to inspect files, then design the architecture migration algorithm", undefined, {
    connectedProviders: new Set(["deepseek", "openrouter"]),
  });

  assert.equal(selected.category, "ultrabrain");
  assert.equal(selected.tier, "high");
  assert.equal(selected.provider, "openrouter");
  assert.equal(selected.model, "z-ai/glm-5.2");
});

test("selectModelForPrompt escalates complex coding from cheap executor to stronger reasoning", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["deepseek", "openrouter"])).model;
  const selected = selectModelForPrompt(
    config,
    "Implement pagination across API, storage, CLI, tests, backward compatibility, concurrency, error handling, and rollout safety",
    undefined,
    { connectedProviders: new Set(["deepseek", "openrouter"]) },
  );

  assert.equal(selected.tier, "high");
  assert.equal(selected.category, "deep");
  assert.equal(selected.provider, "openrouter");
  assert.equal(selected.model, "z-ai/glm-5.2");
  assert.equal(selected.reason, "auto complexity escalation: Deep");
});

test("selectModelForPrompt keeps sticky session model for related follow-up work", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["deepseek", "openrouter"])).model;
  const selected = selectModelForPrompt(config, "Continue the implementation and update the tests", undefined, {
    connectedProviders: new Set(["deepseek", "openrouter"]),
    stickyModel: {
      provider: "openrouter",
      model: "z-ai/glm-5.2",
      tier: "high",
      category: "deep",
    },
  });

  assert.equal(selected.provider, "openrouter");
  assert.equal(selected.model, "z-ai/glm-5.2");
  assert.equal(selected.tier, "high");
  assert.equal(selected.category, "deep");
  assert.equal(selected.reason, "auto sticky session model");
});

test("selectModelForPrompt drops sticky model when prompt becomes materially easier", () => {
  const config = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["deepseek", "openrouter"])).model;
  const selected = selectModelForPrompt(config, "Use rg to find the file and summarize the command output", undefined, {
    connectedProviders: new Set(["deepseek", "openrouter"]),
    stickyModel: {
      provider: "openrouter",
      model: "z-ai/glm-5.2",
      tier: "high",
      category: "deep",
    },
  });

  assert.equal(selected.category, "tool");
  assert.equal(selected.tier, "low");
  assert.equal(selected.provider, "deepseek");
  assert.equal(selected.model, "deepseek-v4-flash");
});

test("selectModelForPrompt does not keep same-tier sticky model for unrelated work", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "Write release notes for the new version", undefined, {
    connectedProviders: new Set(["deepseek", "openai"]),
    stickyModel: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      tier: "low",
      category: "tool",
    },
  });

  assert.equal(selected.category, "writing");
  assert.equal(selected.tier, "low");
  assert.equal(selected.reason, "auto category: Writing");
  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.4-mini");
});

test("selectModelForPrompt skips unhealthy auto category candidates", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "Summarize this note", undefined, {
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

test("selectModelCandidatesForPrompt routes swarm synthesis through the agent profile", () => {
  const selected = selectModelCandidatesForPrompt(defaultAutoConfig(), "Merge swarm lane outputs", undefined, {
    agentId: "swarm-synthesizer",
    connectedProviders: new Set(["openai", "deepseek"]),
  });

  assert.equal(selected[0]?.agent, "swarm-synthesizer");
  assert.equal(selected[0]?.tier, "high");
  assert.equal(selected[0]?.provider, "openai");
  assert.equal(selected[0]?.model, "gpt-5.5");
  assert.equal(selected[1]?.provider, "deepseek");
});

test("selectModelForPrompt routes Korean project analysis to a deep model", () => {
  const selected = selectModelForPrompt(defaultAutoConfig(), "프로젝트 분석", undefined, {
    connectedProviders: new Set(["deepseek", "openai"]),
  });

  assert.equal(selected.category, "deep");
  assert.equal(selected.tier, "high");
  assert.equal(selected.provider, "openai");
  assert.equal(selected.model, "gpt-5.5");
});

test("bootstrapAutoModelConfig uses live catalog models for connected providers", () => {
  const bootstrapped = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set(["deepseek"]), {
    version: 1,
    providers: {
      deepseek: {
        provider: "deepseek",
        fetchedAt: "2026-06-21T00:00:00.000Z",
        source: "live",
        models: ["deepseek-v4-lite", "deepseek-v4-balanced", "deepseek-v4-ultra"],
      },
    },
  });

  assert.equal(bootstrapped.model.mode, "auto");
  assert.equal(bootstrapped.model.auto.categories?.[0]?.candidates[0], "deepseek/deepseek-v4-lite");
  assert.equal(bootstrapped.model.auto.agentRoutes?.find((route) => route.agent === "tech-lead")?.candidates[0], "deepseek/deepseek-v4-ultra");
});

test("bootstrapAutoModelConfig builds route chains from every connected provider", () => {
  const bootstrapped = bootstrapAutoModelConfig(defaultDreamConfigForRouting(), new Set([
    "gemini",
    "qwen",
    "openrouter",
  ]), {
    version: 1,
    providers: {
      gemini: {
        provider: "gemini",
        fetchedAt: "2026-06-21T00:00:00.000Z",
        source: "live",
        models: ["gemini-route-flash", "gemini-route-pro"],
      },
      qwen: {
        provider: "qwen",
        fetchedAt: "2026-06-21T00:00:00.000Z",
        source: "live",
        models: ["qwen-route-lite", "qwen-route-max"],
      },
      openrouter: {
        provider: "openrouter",
        fetchedAt: "2026-06-21T00:00:00.000Z",
        source: "live",
        models: ["openrouter-route-small", "openrouter-route-ultra"],
      },
    },
  });

  const quickCandidates = bootstrapped.model.auto.categories?.find((route) => route.id === "quick")?.candidates ?? [];
  assert.equal(bootstrapped.model.mode, "auto");
  assert.equal(quickCandidates.some((candidate) => candidate.startsWith("gemini/")), true);
  assert.equal(quickCandidates.some((candidate) => candidate.startsWith("qwen/")), true);
  assert.equal(quickCandidates.some((candidate) => candidate.startsWith("openrouter/")), true);
});

test("selectModelCandidatesForPrompt excludes failed models for same-turn failover", () => {
  const selected = selectModelCandidatesForPrompt(defaultAutoConfig(), "Summarize this note", undefined, {
    connectedProviders: new Set(["gemini", "deepseek", "openai"]),
    excludedModels: new Set(["gemini/gemini-3.5-flash"]),
  });

  assert.equal(selected[0]?.provider, "deepseek");
  assert.equal(selected[0]?.model, "deepseek-v4-flash");
  assert.deepEqual(selected[0]?.skipped, ["gemini/gemini-3.5-flash failed"]);
});

test("classifyPromptCategory and route preview expose routing decisions", () => {
  assert.equal(classifyPromptCategory("Write release notes"), "writing");
  assert.match(formatRoutePreview(defaultAutoConfig(), "Summarize this document", {
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

function defaultDreamConfigForRouting(): Parameters<typeof bootstrapAutoModelConfig>[0] {
  const config = defaultConfig();
  return {
    ...config,
    model: defaultAutoConfig(),
  };
}
