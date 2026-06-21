import type { ProviderConnectionSource } from "./tui-provider-status.js";

export type ProviderManagerItem = {
  readonly id: string;
  readonly displayName: string;
  readonly source: ProviderConnectionSource;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly regions: string;
};

export type ProviderManagerOptions = {
  readonly providers: readonly ProviderManagerItem[];
  readonly disabled: readonly string[];
};

export type ProviderManagerResult = {
  readonly selectedProviderId: string | undefined;
  readonly disabled: readonly string[];
};

export type ProviderManagerState = ProviderManagerOptions & {
  readonly query: string;
  readonly selectedIndex: number;
};

export type ProviderManagerAction =
  | { readonly kind: "up" | "down" | "toggle" | "backspace" }
  | { readonly kind: "insert"; readonly value: string };

export function createProviderManagerState(options: ProviderManagerOptions): ProviderManagerState {
  return {
    providers: options.providers,
    disabled: normalizeDisabled(options.disabled),
    query: "",
    selectedIndex: selectedIndexForActive(options.providers),
  };
}

export function reduceProviderManagerState(
  state: ProviderManagerState,
  action: ProviderManagerAction,
): ProviderManagerState {
  switch (action.kind) {
    case "up":
      return clampSelected({ ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) });
    case "down":
      return clampSelected({ ...state, selectedIndex: state.selectedIndex + 1 });
    case "toggle":
      return toggleSelectedProvider(state);
    case "backspace":
      return clampSelected({ ...state, query: state.query.slice(0, -1), selectedIndex: 0 });
    case "insert":
      return clampSelected({ ...state, query: `${state.query}${action.value}`, selectedIndex: 0 });
    default:
      return assertNever(action);
  }
}

export function providerManagerVisibleProviders(state: ProviderManagerState): readonly ProviderManagerItem[] {
  const query = state.query.trim().toLowerCase();
  if (query.length === 0) {
    return state.providers;
  }
  return state.providers.filter((provider) => providerMatchesQuery(provider, query));
}

export function selectedProviderId(state: ProviderManagerState): string | undefined {
  return providerManagerVisibleProviders(state)[state.selectedIndex]?.id;
}

export function normalizeDisabled(disabled: readonly string[]): readonly string[] {
  return [...new Set(disabled)].sort();
}

function toggleSelectedProvider(state: ProviderManagerState): ProviderManagerState {
  const selected = providerManagerVisibleProviders(state)[state.selectedIndex];
  if (selected === undefined) {
    return state;
  }
  const disabled = new Set(state.disabled);
  if (disabled.has(selected.id)) {
    disabled.delete(selected.id);
  } else {
    disabled.add(selected.id);
  }
  return { ...state, disabled: normalizeDisabled([...disabled]) };
}

function providerMatchesQuery(provider: ProviderManagerItem, query: string): boolean {
  return `${provider.id} ${provider.displayName} ${provider.source} ${provider.regions}`.toLowerCase().includes(query);
}

function selectedIndexForActive(providers: readonly ProviderManagerItem[]): number {
  return Math.max(0, providers.findIndex((provider) => provider.active));
}

function clampSelected(state: ProviderManagerState): ProviderManagerState {
  const visibleCount = providerManagerVisibleProviders(state).length;
  return {
    ...state,
    selectedIndex: Math.max(0, Math.min(state.selectedIndex, Math.max(0, visibleCount - 1))),
  };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected provider manager action: ${String(value)}`);
}
