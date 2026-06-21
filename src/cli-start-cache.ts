import { initializeDreamHome } from "./config-init.js";
import { loadConfig, type DreamConfig } from "./config.js";

export type CliHomeInitializer = (root: string) => Promise<{ readonly root: string }>;
export type CliConfigLoader = (root: string) => Promise<DreamConfig>;
export type CliStartState = {
  readonly root: string;
  readonly config: DreamConfig;
};
export type CliStartCache = {
  readonly get: (root: string) => Promise<CliStartState>;
};

export function createCliStartCache(
  initialize: CliHomeInitializer = initializeDreamHome,
  load: CliConfigLoader = loadConfig,
): CliStartCache {
  const states = new Map<string, Promise<CliStartState>>();
  return {
    get: (root) => {
      const existing = states.get(root);
      if (existing !== undefined) {
        return existing;
      }
      const pending = initialize(root).then(async (home) => ({
        root: home.root,
        config: await load(home.root),
      }));
      states.set(root, pending);
      return pending;
    },
  };
}

export const cliStartCache = createCliStartCache();
