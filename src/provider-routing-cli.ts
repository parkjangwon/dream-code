import { defaultConfigRoot, loadConfig } from "./config.js";
import { runRoutePreviewCommand } from "./route-preview-cli.js";

export async function runProviderRouteCommand(rest: readonly string[]): Promise<void> {
  const configRoot = defaultConfigRoot();
  process.stdout.write(await runRoutePreviewCommand({
    configRoot,
    config: await loadConfig(configRoot),
    rest,
  }));
}
