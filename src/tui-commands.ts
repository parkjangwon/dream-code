export type SlashCommand = {
  readonly name: string;
  readonly summary: string;
  readonly acceptsArgs: boolean;
};

export const slashCommands = [
  { name: "/agents", summary: "Delegate tasks and manage agents", acceptsArgs: false },
  { name: "/doctor", summary: "Check local tools", acceptsArgs: false },
  { name: "/help", summary: "Show commands", acceptsArgs: false },
  { name: "/login", summary: "Login to a provider", acceptsArgs: true },
  { name: "/model", summary: "Choose active model", acceptsArgs: true },
  { name: "/provider", summary: "Switch provider or list connections", acceptsArgs: true },
  { name: "/quit", summary: "Exit Dream Code", acceptsArgs: false },
  { name: "/rename", summary: "Rename current session", acceptsArgs: true },
  { name: "/session", summary: "Open saved sessions", acceptsArgs: false },
  { name: "/skills", summary: "Show installed skills", acceptsArgs: false },
  { name: "/status", summary: "Show current session state", acceptsArgs: false },
  { name: "/yolo", summary: "Toggle saved bypass mode", acceptsArgs: false },
] as const satisfies readonly SlashCommand[];
