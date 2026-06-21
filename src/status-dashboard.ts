import { ansi, paint } from "./ansi.js";
import type { DreamConfig } from "./config.js";
import { resolveEffectivePermissionMode } from "./config.js";
import { loadGoalState } from "./goal-state.js";
import { describeModelMode } from "./model-routing.js";
import { formatModelTelemetrySummary } from "./model-telemetry.js";
import { formatTaskSummary } from "./task-ledger.js";
import { formatPermissionMode } from "./tui-render.js";

export async function formatStatusDashboard(root: string, config: DreamConfig, oneShotYolo: boolean): Promise<string> {
  const permissionMode = resolveEffectivePermissionMode(config, oneShotYolo);
  return [
    paint("Dream Status", `${ansi.bold}${ansi.accent}`),
    `${paint("permission", ansi.muted)} ${formatPermissionMode(permissionMode, oneShotYolo)}`,
    `${paint("model", ansi.muted)} ${describeModelMode(config.model)}`,
    `${paint("token saving", ansi.muted)} ${config.tokenSaving.enabled ? "on" : "off"} (${config.tokenSaving.contextBudgetPercent}% budget)`,
    `${paint("goal", ansi.muted)} ${await goalLine(root)}`,
    `${paint("tasks", ansi.muted)} ${await taskLine(root)}`,
    `${paint("health", ansi.muted)} ${await formatModelTelemetrySummary(root)}`,
  ].join("\n");
}

async function goalLine(root: string): Promise<string> {
  const goal = await loadGoalState(root);
  if (goal === undefined) {
    return "none";
  }
  return `${goal.status} · ${goal.title}`;
}

async function taskLine(root: string): Promise<string> {
  return (await formatTaskSummary(root)).replace(/^tasks:\s*/u, "");
}
