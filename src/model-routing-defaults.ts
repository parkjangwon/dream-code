import type { AutoModelAgentRoute, AutoModelCategory, AutoModelCategoryRoute, ModelTier } from "./model-routing.js";

export function defaultAutoCategories(): readonly AutoModelCategoryRoute[] {
  return [
    categoryRoute("quick", "Quick", "low", ["typo", "rename", "format", "simple", "small", "\uAC04\uB2E8", "\uC624\uD0C0"], [
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-mini",
      "gemini/gemini-3.5-flash",
      "groq/llama-3.3-70b-versatile",
    ]),
    categoryRoute("reader", "Reader", "low", ["explain", "summarize", "what is", "how does", "\uC124\uBA85", "\uC694\uC57D"], [
      "gemini/gemini-3.5-flash",
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-mini",
    ]),
    categoryRoute("visual", "Visual", "mid", ["ui", "ux", "css", "react", "html", "layout", "style", "design", "\uD654\uBA74", "\uB514\uC790\uC778", "\uB808\uC774\uC544\uC6C3"], [
      "gemini/gemini-3.5-flash",
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
    ]),
    categoryRoute("deep", "Deep", "high", ["implement", "debug", "refactor", "fix", "test", "backend", "typescript", "analyze", "repository", "codebase", "repo", "project analysis", "\uAD6C\uD604", "\uC218\uC815", "\uB9AC\uD329\uD130", "\uB514\uBC84\uADF8", "\uBD84\uC11D", "\uD504\uB85C\uC81D\uD2B8 \uBD84\uC11D", "\uCF54\uB4DC \uBD84\uC11D", "\uAD6C\uC870 \uBD84\uC11D", "\uB808\uD3EC \uBD84\uC11D", "\uC800\uC7A5\uC18C \uBD84\uC11D"], [
      "deepseek/deepseek-v4-pro",
      "openai/gpt-5.5",
      "opencode-go/kimi-k2.7-code",
    ]),
    categoryRoute("ultrabrain", "Ultrabrain", "high", ["architecture", "algorithm", "migration", "threat model", "distributed", "\uC544\uD0A4\uD14D\uCC98", "\uC54C\uACE0\uB9AC\uC998", "\uC124\uACC4"], [
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
      "openai/gpt-5.4",
    ]),
    categoryRoute("writing", "Writing", "low", ["readme", "docs", "documentation", "release notes", "changelog", "\uBB38\uC11C", "\uAE00"], [
      "gemini/gemini-3.5-flash",
      "openai/gpt-5.4-mini",
      "deepseek/deepseek-v4-flash",
    ]),
    categoryRoute("architect", "Architect", "high", ["/plan", "plan", "design plan", "roadmap", "interview", "\uACC4\uD68D", "\uB85C\uB4DC\uB9F5"], [
      "openai/gpt-5.5",
      "deepseek/deepseek-v4-pro",
      "openai/gpt-5.4",
    ]),
    categoryRoute("executor", "Executor", "low", ["tool result", "command output", "stderr", "stdout", "stack trace", "\uC2E4\uD589 \uACB0\uACFC"], [
      "deepseek/deepseek-v4-flash",
      "openai/gpt-5.4-mini",
      "groq/llama-3.3-70b-versatile",
    ]),
  ];
}

export function defaultAutoAgentRoutes(): readonly AutoModelAgentRoute[] {
  return [
    agentRoute("tech-lead", "high", ["openai/gpt-5.5", "deepseek/deepseek-v4-pro", "openai/gpt-5.4"]),
    agentRoute("security-reviewer", "high", ["deepseek/deepseek-v4-pro", "openai/gpt-5.5", "openai/gpt-5.4"]),
    agentRoute("code-reviewer", "mid", ["deepseek/deepseek-v4-pro", "openai/gpt-5.4", "gemini/gemini-3.5-flash"]),
    agentRoute("code-simplifier", "low", ["deepseek/deepseek-v4-flash", "openai/gpt-5.4-mini", "gemini/gemini-3.5-flash"]),
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
