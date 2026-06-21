import { saveConfig, type DreamConfig } from "./config.js";

export function providerIsEnabled(config: DreamConfig, providerId: string): boolean {
  return config.providers[providerId]?.enabled !== false;
}

export function providerEnabledLabel(config: DreamConfig, providerId: string): "enabled" | "disabled" {
  return providerIsEnabled(config, providerId) ? "enabled" : "disabled";
}

export async function setProviderEnabled(
  root: string,
  config: DreamConfig,
  providerId: string,
  enabled: boolean,
): Promise<DreamConfig> {
  const nextConfig: DreamConfig = {
    ...config,
    providers: {
      ...config.providers,
      [providerId]: { enabled },
    },
  };
  await saveConfig(root, nextConfig);
  return nextConfig;
}
