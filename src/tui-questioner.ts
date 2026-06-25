import type { DreamConfig } from "./config.js";
import type { AgentViewOptions, AgentViewResult } from "./tui-agent-view.js";
import type { PickerOptions } from "./tui-picker.js";
import type { ProviderManagerOptions, ProviderManagerResult } from "./tui-provider-manager-state.js";
import type { SkillManagerOptions } from "./tui-skill-manager.js";

export type CommandResult = {
  readonly config: DreamConfig;
  readonly shouldContinue: boolean;
  readonly queuedInputs?: readonly string[];
};

export type Questioner = {
  readonly question: (prompt: string) => Promise<string>;
  readonly secret?: (prompt: string) => Promise<string>;
  readonly select?: (options: PickerOptions) => Promise<string | undefined>;
  readonly manageAgents?: (options: AgentViewOptions) => Promise<AgentViewResult>;
  readonly manageProviders?: (options: ProviderManagerOptions) => Promise<ProviderManagerResult | undefined>;
  readonly manageSkills?: (options: SkillManagerOptions) => Promise<readonly string[] | undefined>;
  readonly wasCancelled?: () => boolean;
};
