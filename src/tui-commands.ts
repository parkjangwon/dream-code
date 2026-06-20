export type SlashCommand = {
  readonly name: string;
  readonly summary: string;
  readonly acceptsArgs: boolean;
};

export const slashCommands = [
  { name: "/help", summary: "Show commands", acceptsArgs: false },
  { name: "/status", summary: "Show current session state", acceptsArgs: false },
  { name: "/doctor", summary: "Check local tools", acceptsArgs: false },
  { name: "/yolo", summary: "Toggle saved bypass mode", acceptsArgs: false },
  { name: "/model", summary: "Show model routing", acceptsArgs: false },
  { name: "/models", summary: "Choose active model", acceptsArgs: true },
  { name: "/providers", summary: "List provider connections", acceptsArgs: false },
  { name: "/login", summary: "Login to a provider", acceptsArgs: true },
  { name: "/read", summary: "Read a workspace file", acceptsArgs: true },
  { name: "/write", summary: "Write a text file", acceptsArgs: true },
  { name: "/edit", summary: "Replace text in a file", acceptsArgs: true },
  { name: "/shell", summary: "Run a shell command", acceptsArgs: true },
  { name: "/goal", summary: "Open goal workflow", acceptsArgs: true },
  { name: "/plan", summary: "Open plan workflow", acceptsArgs: true },
  { name: "/interview", summary: "Open interview workflow", acceptsArgs: true },
  { name: "/swarm", summary: "Open swarm workflow", acceptsArgs: true },
  { name: "/team", summary: "Show team members", acceptsArgs: false },
  { name: "/research", summary: "Open research workflow", acceptsArgs: true },
  { name: "/lsp", summary: "Open LSP workflow", acceptsArgs: true },
  { name: "/quit", summary: "Exit Dream Code", acceptsArgs: false },
] as const satisfies readonly SlashCommand[];
