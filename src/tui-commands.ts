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
  { name: "/model", summary: "Choose active model", acceptsArgs: true },
  { name: "/provider", summary: "Switch provider or list connections", acceptsArgs: true },
  { name: "/login", summary: "Login to a provider", acceptsArgs: true },
  { name: "/quit", summary: "Exit Dream Code", acceptsArgs: false },
] as const satisfies readonly SlashCommand[];
