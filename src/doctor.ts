import { spawn } from "node:child_process";

export type DoctorCheck = {
  readonly name: string;
  readonly required: boolean;
  readonly available: boolean;
  readonly detail: string;
};

type ToolSpec = {
  readonly name: string;
  readonly command: string;
  readonly required: boolean;
  readonly detailWhenAvailable: string;
  readonly detailWhenMissing: string;
};

const optionalToolSpecs: readonly ToolSpec[] = [
  {
    name: "git",
    command: "git",
    required: false,
    detailWhenAvailable: "repository workflows enabled",
    detailWhenMissing: "missing; repository workflows are limited",
  },
  {
    name: "rg",
    command: "rg",
    required: false,
    detailWhenAvailable: "fast code search enabled",
    detailWhenMissing: "missing; fallback file scanning will be used",
  },
  {
    name: "fd",
    command: "fd",
    required: false,
    detailWhenAvailable: "fast file discovery enabled",
    detailWhenMissing: "missing; Node directory walking remains available",
  },
  {
    name: "jq",
    command: "jq",
    required: false,
    detailWhenAvailable: "JSON inspection helpers enabled",
    detailWhenMissing: "missing; built-in JSON parsing remains available",
  },
  {
    name: "python3",
    command: "python3",
    required: false,
    detailWhenAvailable: "script adapters available",
    detailWhenMissing: "missing; JS-only adapters remain available",
  },
  {
    name: "typescript-language-server",
    command: "typescript-language-server",
    required: false,
    detailWhenAvailable: "LSP adapter can connect to TypeScript projects",
    detailWhenMissing: "missing; LSP support can use project-local servers later",
  },
];

export function summarizeDoctor(checks: readonly DoctorCheck[]): string {
  const lines = ["Dream Doctor"];

  for (const check of checks) {
    const icon = check.available ? "ok" : "missing";
    const kind = check.required ? "required" : "optional";
    lines.push(`${icon} ${check.name} (${kind}) - ${check.detail}`);
  }

  if (checks.some((check) => !check.required && !check.available)) {
    lines.push("Optional tools have fallback paths; install them for the fastest workflows.");
  }

  if (checks.some((check) => check.required && !check.available)) {
    lines.push("A required tool is missing; install it before running Dream Code.");
  }

  return lines.join("\n");
}

export async function runDoctor(): Promise<readonly DoctorCheck[]> {
  const npmCheck = await checkTool({
    name: "npm",
    command: "npm",
    required: true,
    detailWhenAvailable: "package installation available",
    detailWhenMissing: "missing; install Node.js with npm",
  });
  const optionalChecks = await Promise.all(optionalToolSpecs.map((tool) => checkTool(tool)));

  return [
    {
      name: "node",
      required: true,
      available: true,
      detail: process.version,
    },
    npmCheck,
    ...optionalChecks,
  ];
}

async function checkTool(tool: ToolSpec): Promise<DoctorCheck> {
  const available = await commandExists(tool.command);
  return {
    name: tool.name,
    required: tool.required,
    available,
    detail: available ? tool.detailWhenAvailable : tool.detailWhenMissing,
  };
}

function commandExists(commandName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child =
      process.platform === "win32"
        ? spawn("where.exe", [commandName], { stdio: "ignore" })
        : spawn("sh", ["-lc", `command -v ${singleQuote(commandName)}`], { stdio: "ignore" });

    child.once("error", () => {
      resolve(false);
    });
    child.once("close", (code) => {
      resolve(code === 0);
    });
  });
}

function singleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
