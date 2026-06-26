export type ProviderProtocol = "chat-completions" | "responses";
export type ApiKeyHeader = "authorization" | "api-key";

export type ProviderRegion = {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
};

export type ProviderTierModels = {
  readonly low: string;
  readonly mid: string;
  readonly high: string;
};

export type ProviderAuthMode = "api-key" | "oauth" | "none";

export type ProviderDefinition = {
  readonly id: string;
  readonly displayName: string;
  readonly protocol: ProviderProtocol;
  readonly apiKeyHeader: ApiKeyHeader;
  readonly envKeys: readonly string[];
  readonly regions: readonly ProviderRegion[];
  readonly defaultRegion: string;
  readonly defaultModels: ProviderTierModels;
  readonly availableModels: readonly string[];
  readonly auth: readonly ProviderAuthMode[];
  readonly docsUrl: string;
};
