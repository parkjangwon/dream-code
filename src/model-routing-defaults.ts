import type { AutoModelAgentRoute, AutoModelCategory, AutoModelCategoryRoute, ModelTier } from "./model-routing.js";

export function defaultAutoCategories(): readonly AutoModelCategoryRoute[] {
  return [
    categoryRoute("quick", "Quick", "low", ["typo", "rename", "format", "simple", "small", "\uAC04\uB2E8", "\uC624\uD0C0"], [
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-nano",
      "gemini/gemini-3.5-flash",
      "groq/llama-3.3-70b-versatile",
    ]),
    categoryRoute("reader", "Reader", "low", ["analyze", "explain", "summarize", "what is", "how does", "\uBD84\uC11D", "\uC124\uBA85", "\uC694\uC57D"], [
      "gemini/gemini-3.5-flash",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-mini",
    ]),
    categoryRoute("visual", "Visual", "mid", ["ui", "ux", "css", "react", "html", "layout", "style", "design", "\uD654\uBA74", "\uB514\uC790\uC778", "\uB808\uC774\uC544\uC6C3"], [
      "gemini/gemini-3.5-flash",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("deep", "Deep", "high", ["implement", "debug", "refactor", "fix", "test", "backend", "typescript", "\uAD6C\uD604", "\uC218\uC815", "\uB9AC\uD329\uD130", "\uB514\uBC84\uADF8"], [
      "deepseek/deepseek-v4-pro",
      "openai/gpt-5.3-codex",
      "opencode-go/kimi-k2.7-code",
    ]),
    categoryRoute("ultrabrain", "Ultrabrain", "high", ["architecture", "algorithm", "migration", "threat model", "distributed", "\uC544\uD0A4\uD14D\uCC98", "\uC54C\uACE0\uB9AC\uC998", "\uC124\uACC4"], [
      "openai/gpt-5.5-pro",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("writing", "Writing", "low", ["readme", "docs", "documentation", "release notes", "changelog", "\uBB38\uC11C", "\uAE00"], [
      "gemini/gemini-3.5-flash",
      "openai/gpt-5.4-mini",
      "deepseek/deepseek-v4-flash",
    ]),
    categoryRoute("architect", "Architect", "high", ["/plan", "plan", "design plan", "roadmap", "interview", "\uACC4\uD68D", "\uB85C\uB4DC\uB9F5"], [
      "openai/gpt-5.5-pro",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("executor", "Executor", "low", ["tool result", "command output", "stderr", "stdout", "stack trace", "\uC2E4\uD589 \uACB0\uACFC"], [
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-nano",
      "groq/llama-3.3-70b-versatile",
    ]),
  ];
}

export function defaultAutoAgentRoutes(): readonly AutoModelAgentRoute[] {
  return [
    agentRoute("tech-lead", "high", ["openai/gpt-5.5-pro", "openai/gpt-5.5", "deepseek/deepseek-v4-pro"]),
    agentRoute("security-reviewer", "high", ["deepseek/deepseek-v4-pro", "openai/gpt-5.3-codex", "openai/gpt-5.5"]),
    agentRoute("code-reviewer", "mid", ["deepseek/deepseek-v4-pro", "openai/gpt-5.3-codex", "gemini/gemini-3.5-flash"]),
    agentRoute("code-simplifier", "low", ["deepseek/deepseek-v4-flash", "openai/gpt-5.4-nano", "gemini/gemini-3.5-flash"]),
    agentRoute("ux-reviewer", "mid", ["gemini/gemini-3.5-flash", "openai/gpt-5.5", "deepseek/deepseek-v4-pro"]),
    agentRoute("swarm-synthesizer", "high", ["openai/gpt-5.5", "deepseek/deepseek-v4-pro", "opencode-go/kimi-k2.7-code"]),
  ];
}

function categoryRoute(
  id: AutoModelCategory,
  label: string,
  tier: ModelTier,
  match: readonly string[],
  candidates: readonly string[],
): AutoModelCategoryRoute {
  return { id, label, tier, match: [...match], candidates: [...candidates] };
}

function agentRoute(
  agent: string,
  tier: ModelTier,
  candidates: readonly string[],
): AutoModelAgentRoute {
  return { agent, tier, candidates: [...candidates] };
}
