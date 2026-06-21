import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import type { Key } from "node:readline";

import { ansi, paint } from "./ansi.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { clearRenderedLines, renderPaletteDescription } from "./tui-input-render.js";
import {
  createProviderManagerState,
  normalizeDisabled,
  providerManagerVisibleProviders,
  reduceProviderManagerState,
  selectedProviderId,
  type ProviderManagerAction,
  type ProviderManagerItem,
  type ProviderManagerOptions,
  type ProviderManagerResult,
  type ProviderManagerState,
} from "./tui-provider-manager-state.js";
import type { ProviderConnectionSource } from "./tui-provider-status.js";

export type InteractiveProviderManagerOptions = ProviderManagerOptions & { readonly redrawHeader: () => void };

const maxVisibleProviders = 12;

export function readInteractiveProviderManager(
  options: InteractiveProviderManagerOptions,
): Promise<ProviderManagerResult | undefined> {
  return new Promise((resolve) => {
    let state = createProviderManagerState(options);
    let renderedLines = 0;
    const previousRawMode = input.isRaw;

    const render = (): void => {
      clearRenderedLines(renderedLines);
      renderedLines = renderProviderManagerView(state);
    };

    const finish = (value: ProviderManagerResult | undefined): void => {
      clearRenderedLines(renderedLines);
      cleanup();
      resolve(value);
    };

    const onKeypress = (value: string | undefined, key: Key): void => {
      if (key.ctrl === true && key.name === "l") {
        options.redrawHeader();
        renderedLines = 0;
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish({ selectedProviderId: selectedProviderId(state), disabled: normalizeDisabled(state.disabled) });
        return;
      }
      if (key.name === "escape" || (key.ctrl === true && key.name === "c")) {
        finish(undefined);
        return;
      }

      const action = providerManagerActionForKey(value, key);
      if (action === undefined) {
        return;
      }
      state = reduceProviderManagerState(state, action);
      render();
    };

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
    };

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    render();
  });
}

function renderProviderManagerView(state: ProviderManagerState): number {
  const width = Math.max(72, output.columns ?? 80);
  const contentWidth = Math.min(width, 140);
  const visible = providerManagerVisibleProviders(state);
  const enabledCount = state.providers.filter((provider) => !state.disabled.includes(provider.id)).length;
  const start = visibleStart(state.selectedIndex, visible.length);
  const windowed = visible.slice(start, start + maxVisibleProviders);
  const lines = [
    `${paint("Providers", ansi.accent)} ${paint(`${state.providers.length} providers · ${enabledCount} enabled`, ansi.dim)}`,
    `${paint("Search:", ansi.guide)} ${state.query}`,
    paint("↑/↓ navigate · type to search · space toggle · enter save/select · esc discard", ansi.guide),
    paint("─".repeat(contentWidth), ansi.guide),
    `${paint("state", ansi.dim)}  ${paint("provider", ansi.dim).padEnd(30)} ${paint("source", ansi.dim).padEnd(12)} ${paint("regions", ansi.dim)}`,
  ];

  for (let index = 0; index < windowed.length; index += 1) {
    const provider = windowed[index];
    if (provider !== undefined) {
      lines.push(formatProviderManagerLine(provider, state, start + index === state.selectedIndex, contentWidth));
    }
  }
  if (visible.length === 0) {
    lines.push(paint("No matching providers", ansi.yellow));
  }
  lines.push(paint("─".repeat(contentWidth), ansi.guide));
  lines.push(paint("Disabled providers are ignored by auto routing and provider switching.", ansi.guide));
  output.write(lines.join("\n"));
  moveCursorToSearchLine(lines.length, state.query);
  return lines.length;
}

function formatProviderManagerLine(
  provider: ProviderManagerItem,
  state: ProviderManagerState,
  selected: boolean,
  width: number,
): string {
  const enabled = !state.disabled.includes(provider.id);
  const marker = selected ? paint(">", ansi.accent) : " ";
  const checkbox = enabled ? paint("[v]", ansi.green) : paint("[ ]", ansi.yellow);
  const active = provider.active ? paint("*", ansi.accent) : " ";
  const name = padVisible(paint(`${active}${renderPaletteDescription(provider.displayName, 23)}`, ansi.blue), 28);
  const source = padVisible(formatSource(provider.source), 10);
  const prefix = `${marker} ${checkbox} ${name} ${source} `;
  const regions = renderPaletteDescription(provider.regions, width - terminalVisibleWidth(prefix));
  return `${prefix}${paint(regions, ansi.dim)}`;
}

function providerManagerActionForKey(
  value: string | undefined,
  key: Key,
): ProviderManagerAction | undefined {
  switch (key.name) {
    case "up":
      return { kind: "up" };
    case "down":
      return { kind: "down" };
    case "space":
      return { kind: "toggle" };
    case "backspace":
    case "delete":
      return { kind: "backspace" };
    default:
      break;
  }
  if (value === " ") {
    return { kind: "toggle" };
  }
  if (key.ctrl === true || key.meta === true || value === undefined || value.length === 0) {
    return undefined;
  }
  return { kind: "insert", value };
}

function visibleStart(selectedIndex: number, visibleCount: number): number {
  return Math.max(0, Math.min(selectedIndex, visibleCount - maxVisibleProviders));
}

function moveCursorToSearchLine(lineCount: number, query: string): void {
  const linesToSearch = Math.max(0, lineCount - 2);
  if (linesToSearch > 0) {
    output.write(`\u001B[${linesToSearch}A`);
  }
  output.write("\r");
  output.write(`\u001B[${8 + terminalVisibleWidth(query)}C`);
}

function formatSource(source: ProviderConnectionSource): string {
  switch (source) {
    case "env":
      return paint("env", ansi.blue);
    case "oauth":
    case "saved":
      return paint(source, ansi.green);
    case "missing":
      return paint("unset", ansi.yellow);
    case "disabled":
      return paint("disabled", ansi.red);
    default:
      return assertNever(source);
  }
}

function padVisible(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - terminalVisibleWidth(text)))}`;
}

function assertNever(value: never): never {
  throw new Error(`Unexpected provider manager value: ${String(value)}`);
}
