import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAgentToolRequest } from "./agent-tools.js";
import type { DreamConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { saveFileCheckpoint } from "./file-history.js";
import { selectModelCandidatesForPrompt } from "./model-routing.js";
import { remoteDevicesPath } from "./remote-auth.js";
import { startSession } from "./session-store.js";
import { createWorkdayPlan } from "./workday-plan.js";

export type SmokeCheckStatus = "pass" | "warn" | "fail";

export type SmokeCheck = {
  readonly id: string;
  readonly label: string;
  readonly status: SmokeCheckStatus;
  readonly detail: string;
  readonly repair: string;
};

export type SmokeReport = {
  readonly title: "Dream Smoke";
  readonly cwd: string;
  readonly ok: boolean;
  readonly checks: readonly SmokeCheck[];
};

export type SmokeOptions = {
  readonly cwd: string;
  readonly configRoot: string;
  readonly config: DreamConfig;
  readonly oneShotYolo: boolean;
};

export async function runSmoke(options: SmokeOptions): Promise<SmokeReport> {
  await mkdir(options.configRoot, { recursive: true, mode: 0o700 });
  const [doctorChecks, workdayPlan, readResult, statResult, blockedMutation, sessionOk, checkpointOk] = await Promise.all([
    runDoctor(),
    createWorkdayPlan({ cwd: options.cwd, config: options.config, oneShotYolo: options.oneShotYolo, dryRun: true }),
    runAgentToolRequest({ tool: "read", path: "package.json", startLine: 1, endLine: 20 }, { mode: "plan", workspaceRoot: options.cwd }),
    runAgentToolRequest({ tool: "stat", path: "package.json" }, { mode: "plan", workspaceRoot: options.cwd }),
    runAgentToolRequest({ tool: "write", path: ".dream-smoke-probe", content: "no" }, { mode: "plan", workspaceRoot: options.cwd }),
    checkSessionStore(options.configRoot, options.cwd),
    checkCheckpointStore(options.configRoot),
  ]);
  const checks = [
    doctorCheck(doctorChecks),
    workdayCheck(workdayPlan.sections.some((section) => section.id === "smoke")),
    toolReadCheck(readResult.ok && statResult.ok),
    toolGuardCheck(!blockedMutation.ok && /Plan mode/u.test(blockedMutation.output)),
    sessionStoreCheck(sessionOk),
    checkpointStoreCheck(checkpointOk),
    modelRouteCheck(options.config),
    remoteSecurityCheck(options.configRoot),
    smokeGateCheck(options.config.permissions.mode === "yolo", options.oneShotYolo),
  ];

  return {
    title: "Dream Smoke",
    cwd: options.cwd,
    ok: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

export function formatSmokeReport(report: SmokeReport): string {
  return [
    report.title,
    `cwd ${report.cwd}`,
    `status ${report.ok ? "pass" : "fail"}`,
    "",
    ...report.checks.map((check) => `${check.status} ${check.label} - ${check.detail}\n  repair: ${check.repair}`),
  ].join("\n");
}

function doctorCheck(checks: readonly { readonly required: boolean; readonly available: boolean }[]): SmokeCheck {
  const missingRequired = checks.filter((check) => check.required && !check.available).length;
  return {
    id: "doctor",
    label: "doctor",
    status: missingRequired === 0 ? "pass" : "fail",
    detail: missingRequired === 0 ? "required tools available" : `${missingRequired} required tools missing`,
    repair: missingRequired === 0 ? "No action required." : "Run `dream doctor`, install the missing required tools, then rerun `dream smoke`.",
  };
}

function workdayCheck(hasSmokeGate: boolean): SmokeCheck {
  return {
    id: "workday",
    label: "workday",
    status: hasSmokeGate ? "pass" : "fail",
    detail: hasSmokeGate ? "workday includes smoke gate" : "workday smoke gate missing",
    repair: hasSmokeGate ? "No action required." : "Update workday readiness so release flow includes `dream smoke`.",
  };
}

function toolReadCheck(ok: boolean): SmokeCheck {
  return {
    id: "tool-read",
    label: "tool read",
    status: ok ? "pass" : "fail",
    detail: ok ? "read-only workspace tools responded" : "read-only workspace tools failed",
    repair: ok ? "No action required." : "Check workspace permissions and verify `package.json` is readable.",
  };
}

function toolGuardCheck(ok: boolean): SmokeCheck {
  return {
    id: "tool-guard",
    label: "tool guard",
    status: ok ? "pass" : "fail",
    detail: ok ? "mutating workspace tool is blocked in plan mode" : "mutating workspace guard failed",
    repair: ok ? "No action required." : "Inspect permission policy and ensure mutating tools require approval outside YOLO mode.",
  };
}

function smokeGateCheck(savedYolo: boolean, oneShotYolo: boolean): SmokeCheck {
  const yoloActive = savedYolo || oneShotYolo;
  return {
    id: "smoke-gate",
    label: "smoke gate",
    status: yoloActive ? "warn" : "pass",
    detail: yoloActive ? "YOLO is active; keep smoke evidence with the final diff" : "permission guard is not bypassed",
    repair: yoloActive ? "Switch permission mode back to ask/plan before release unless this run intentionally needs YOLO." : "No action required.",
  };
}

async function checkSessionStore(configRoot: string, cwd: string): Promise<boolean> {
  const root = await mkdtemp(join(configRoot, "smoke-session-"));
  try {
    await startSession(root, cwd);
    return true;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function checkCheckpointStore(configRoot: string): Promise<boolean> {
  const root = await mkdtemp(join(configRoot, "smoke-history-"));
  const project = await mkdtemp(join(tmpdir(), "dream-smoke-project-"));
  try {
    await writeFile(join(project, "probe.txt"), "probe\n", "utf8");
    await saveFileCheckpoint("probe.txt", project, root);
    return true;
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
}

function sessionStoreCheck(ok: boolean): SmokeCheck {
  return {
    id: "session-store",
    label: "session store",
    status: ok ? "pass" : "fail",
    detail: ok ? "session store is writable in an isolated smoke root" : "session store write failed",
    repair: ok ? "No action required." : "Check Dream config root permissions and available disk space, then rerun smoke.",
  };
}

function checkpointStoreCheck(ok: boolean): SmokeCheck {
  return {
    id: "checkpoint-store",
    label: "checkpoint store",
    status: ok ? "pass" : "fail",
    detail: ok ? "file checkpoint store can write and clean up snapshots" : "checkpoint store write failed",
    repair: ok ? "No action required." : "Check snapshot directory permissions and rerun with a writable config root.",
  };
}

function modelRouteCheck(config: DreamConfig): SmokeCheck {
  const candidates = selectModelCandidatesForPrompt(config.model, "fix failing tests and verify", "mid", {
    connectedProviders: new Set<string>(),
    unhealthyModels: new Set<string>(),
    modelAvailable: () => true,
  });
  return {
    id: "model-route",
    label: "model route",
    status: candidates.length > 0 ? "pass" : "warn",
    detail: candidates.length > 0 ? `route preview selected ${candidates[0]?.provider}/${candidates[0]?.model}` : "no model route candidate selected",
    repair: candidates.length > 0 ? "No action required." : "Connect at least one provider or configure model routing before autonomous work.",
  };
}

function remoteSecurityCheck(configRoot: string): SmokeCheck {
  const path = remoteDevicesPath(configRoot);
  return {
    id: "remote-security",
    label: "remote security",
    status: path.includes(`${join(configRoot, "remote")}`) ? "pass" : "fail",
    detail: "remote device tokens are stored as hashed records under the Dream config root",
    repair: path.includes(`${join(configRoot, "remote")}`) ? "No action required." : "Reset the Dream config root so remote device records stay under the configured home.",
  };
}
