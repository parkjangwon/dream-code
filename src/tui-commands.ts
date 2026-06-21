export type SlashCommand = {
  readonly name: string;
  readonly summary: string;
  readonly acceptsArgs: boolean;
};

export const slashCommands = [
  { name: "/add-dir", summary: "Add a workspace directory", acceptsArgs: true },
  { name: "/agents", summary: "Delegate tasks and manage agents", acceptsArgs: false },
  { name: "/artifact", summary: "View artifacts", acceptsArgs: false },
  { name: "/btw", summary: "Ask a side question", acceptsArgs: true },
  { name: "/compact", summary: "Compact current session context", acceptsArgs: false },
  { name: "/copy", summary: "Copy last response", acceptsArgs: false },
  { name: "/doctor", summary: "Check local tools", acceptsArgs: false },
  { name: "/exit", summary: "Exit Dream Code", acceptsArgs: false },
  { name: "/export", summary: "Export current conversation", acceptsArgs: false },
  { name: "/goal", summary: "Start goal mode", acceptsArgs: true },
  { name: "/help", summary: "Show commands", acceptsArgs: false },
  { name: "/hooks", summary: "Show hook settings", acceptsArgs: false },
  { name: "/interview", summary: "Align on implementation direction", acceptsArgs: false },
  { name: "/login", summary: "Login to a provider", acceptsArgs: true },
  { name: "/logout", summary: "Forget provider credentials", acceptsArgs: true },
  { name: "/lsp", summary: "Run language diagnostics", acceptsArgs: false },
  { name: "/mcp", summary: "Show MCP settings", acceptsArgs: false },
  { name: "/model", summary: "Choose active model", acceptsArgs: true },
  { name: "/plan", summary: "Create an implementation plan", acceptsArgs: true },
  { name: "/provider", summary: "Switch provider or list connections", acceptsArgs: true },
  { name: "/quit", summary: "Exit Dream Code", acceptsArgs: false },
  { name: "/rename", summary: "Rename current session", acceptsArgs: true },
  { name: "/research", summary: "Research with source discipline", acceptsArgs: true },
  { name: "/review", summary: "Review current work", acceptsArgs: true },
  { name: "/rules", summary: "Show loaded AGENTS and DESIGN docs", acceptsArgs: false },
  { name: "/session", summary: "Open saved sessions", acceptsArgs: false },
  { name: "/skills", summary: "Show installed skills", acceptsArgs: false },
  { name: "/status", summary: "Show goal, tasks, and model health", acceptsArgs: false },
  { name: "/swarm", summary: "Explode a goal across parallel agents", acceptsArgs: true },
  { name: "/tasks", summary: "Show or add tasks", acceptsArgs: true },
  { name: "/verify", summary: "Plan verification checks", acceptsArgs: true },
  { name: "/yolo", summary: "Toggle saved bypass mode", acceptsArgs: false },
] as const satisfies readonly SlashCommand[];
