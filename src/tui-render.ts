import { homedir } from "node:os";
import { cwd, stdout as output } from "node:process";

import { ansi, clearScreen, paint } from "./ansi.js";
import { resolveEffectivePermissionMode, type DreamConfig, type PermissionMode } from "./config.js";
import { DREAM_SIGNATURE, DREAM_VERSION } from "./constants.js";
import { describeModelMode, selectSingleProviderModel } from "./model-routing.js";
import { renderDreamLogo } from "./tui-logo.js";

export function renderHeader(config: DreamConfig, oneShotYolo: boolean): void {
  const width = Math.max(64, output.columns ?? 80);

  output.write(clearScreen());
  output.write("\n");
  for (const line of renderHeaderPanel(config, oneShotYolo, width)) {
    output.write(`${line}\n`);
  }
  output.write("\n");
}

export function printHelp(): void {
  output.write([
    "Commands:",
    "  /                       open command menu",
    "  /status                 show current config",
    "  /doctor                 check local tools",
    "  /yolo                   toggle persisted unconditional bypass",
    "  /model                  choose active model",
    "  /provider               switch connected provider",
    "  /login                  connect a provider account",
    "  !<cmd>                  run a shell command",
    "  /quit                   exit",
    "",
    "Keys:",
    "  Ctrl+L                  redraw the header without losing status",
    "  Up/Down                 browse history or move command menu selection",
    "  Left/Right              move cursor",
    "  Ctrl+A / Ctrl+E         move to start/end of input",
    "  Ctrl+U / Ctrl+K         clear before/after cursor",
    "  Enter                   submit or choose a command menu item",
  ].join("\n"));
  output.write("\n");
}

export function printStatus(config: DreamConfig, oneShotYolo: boolean): void {
  const mode = resolveEffectivePermissionMode(config, oneShotYolo);
  output.write(`permission: ${formatPermissionMode(mode, oneShotYolo)}\n`);
  output.write(`model: ${describeModelMode(config.model)}\n`);
  output.write(`token saving: ${config.tokenSaving.enabled ? "on" : "off"} (${config.tokenSaving.contextBudgetPercent}% budget)\n`);
  output.write(`team members: ${config.team.filter((member) => member.enabled).length}\n`);
}

export function printScaffold(commandName: string, rest: string, config: DreamConfig): void {
  if (commandName === "/team") {
    for (const member of config.team) {
      output.write(`${member.enabled ? "on" : "off"} ${member.name} - ${member.mission}\n`);
    }
    return;
  }
  output.write(`${commandName.slice(1)} scaffold ready`);
  if (rest.length > 0) {
    output.write(`: ${rest}`);
  }
  output.write("\n");
}

export function formatPermissionMode(mode: PermissionMode, oneShotYolo: boolean): string {
  const text = permissionModeText(mode, oneShotYolo);
  return mode === "yolo" ? paint(text, ansi.red) : text;
}

export function renderHeaderPanel(
  config: DreamConfig,
  oneShotYolo: boolean,
  terminalWidth: number,
): readonly string[] {
  const width = Math.max(64, terminalWidth);
  const contentWidth = width - 2;
  const infoWidth = Math.max(20, contentWidth - 13);
  const logoRows = renderDreamLogo();
  const permissionMode = resolveEffectivePermissionMode(config, oneShotYolo);
  const infoRows = [
    paint(`Welcome to Dream Code ${DREAM_VERSION}!`, ansi.accent + ansi.bold),
    paint(truncateText(DREAM_SIGNATURE, infoWidth), ansi.dim),
    infoLine("Directory:", formatWorkspacePath(), infoWidth),
    infoLine("Model:", formatModelSummary(config), infoWidth),
    infoLine(
      "Permission:",
      permissionModeText(permissionMode, oneShotYolo),
      infoWidth,
      permissionMode === "yolo" ? ansi.red : ansi.blue,
    ),
  ] as const;

  return logoRows.map((logoRow, index) => {
    return panelLine(`${logoRow}   ${infoRows[index] ?? ""}`, contentWidth);
  });
}

function formatModelSummary(config: DreamConfig): string {
  if (config.model.mode === "single") {
    const selected = selectSingleProviderModel(config.model.single);
    return `${selected.provider} ${selected.model} (${titleCase(selected.tier)})`;
  }

  return describeModelMode(config.model);
}

function formatWorkspacePath(): string {
  const home = homedir();
  const current = cwd();
  return current.startsWith(home) ? `~${current.slice(home.length)}` : current;
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function permissionModeText(mode: PermissionMode, oneShotYolo: boolean): string {
  if (mode === "yolo" && oneShotYolo) {
    return "YOLO ON (one-shot bypass)";
  }
  if (mode === "yolo") {
    return "YOLO ON (saved bypass)";
  }
  return mode;
}

function infoLine(
  label: string,
  value: string,
  width: number,
  valueColor: string = ansi.blue,
): string {
  const labelWidth = label.length + 1;
  const remainingWidth = Math.max(1, width - labelWidth);
  return `${paint(label, ansi.dim)} ${paint(truncateText(value, remainingWidth), valueColor)}`;
}

function panelLine(content: string, width: number): string {
  const padding = " ".repeat(Math.max(0, width - visibleLength(content)));
  return ` ${content}${padding}`;
}

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }
  if (maxWidth <= 1) {
    return "…";
  }
  return `${text.slice(0, maxWidth - 1)}…`;
}

function visibleLength(text: string): number {
  return text.replace(/\u001B\[[0-9;]*m/g, "").length;
}
