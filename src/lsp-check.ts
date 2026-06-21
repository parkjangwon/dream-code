import { access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { ansi, paint } from "./ansi.js";

const maxOutput = 12_000;

export async function runLspCheck(cwd: string): Promise<string> {
  const commands = await detectDiagnosticCommands(cwd);
  if (commands.length === 0) {
    return [
      paint("LSP", `${ansi.bold}${ansi.accent}`),
      paint("No supported project diagnostics detected.", ansi.dim),
      paint("Supported: TypeScript, Rust, Go, Python, Java.", ansi.dim),
    ].join("\n");
  }
  const results = await Promise.all(commands.map(async (command) => ({
    command,
    result: await runCommand(command.command, command.args, cwd),
  })));
  return [
    paint("LSP", `${ansi.bold}${ansi.accent}`),
    ...results.flatMap(({ command, result }) => [
      `${paint(command.label, ansi.blue)} ${result.ok ? paint("clean", ansi.green) : paint("failed", ansi.red)} ${paint(command.display, ansi.dim)}`,
      result.output.length === 0 ? paint("No diagnostics.", ansi.dim) : result.output,
    ]),
  ].join("\n");
}

export type DiagnosticCommand = {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly display: string;
};

export async function detectDiagnosticCommands(cwd: string): Promise<readonly DiagnosticCommand[]> {
  const commands: DiagnosticCommand[] = [];
  if (await exists(join(cwd, "tsconfig.json"))) {
    commands.push({ label: "TypeScript", command: "npx", args: ["tsc", "-p", "tsconfig.json", "--noEmit"], display: "npx tsc -p tsconfig.json --noEmit" });
  }
  if (await exists(join(cwd, "Cargo.toml"))) {
    commands.push({ label: "Rust", command: "cargo", args: ["check"], display: "cargo check" });
  }
  if (await exists(join(cwd, "go.mod"))) {
    commands.push({ label: "Go", command: "go", args: ["test", "./..."], display: "go test ./..." });
  }
  if (await exists(join(cwd, "pyproject.toml"))) {
    commands.push({ label: "Python", command: "python3", args: ["-m", "compileall", "-q", "."], display: "python3 -m compileall -q ." });
  }
  if (await exists(join(cwd, "pom.xml"))) {
    commands.push({ label: "Java (Maven)", command: "mvn", args: ["-q", "-DskipTests", "compile"], display: "mvn -q -DskipTests compile" });
  }
  if (await hasGradleProject(cwd)) {
    commands.push(await gradleDiagnosticCommand(cwd));
  }
  return commands;
}

async function hasGradleProject(cwd: string): Promise<boolean> {
  return await exists(join(cwd, "build.gradle"))
    || await exists(join(cwd, "build.gradle.kts"))
    || await exists(join(cwd, "settings.gradle"))
    || await exists(join(cwd, "settings.gradle.kts"));
}

async function gradleDiagnosticCommand(cwd: string): Promise<DiagnosticCommand> {
  if (process.platform === "win32" && await exists(join(cwd, "gradlew.bat"))) {
    return { label: "Java (Gradle)", command: "gradlew.bat", args: ["testClasses"], display: "gradlew.bat testClasses" };
  }
  if (await exists(join(cwd, "gradlew"))) {
    return { label: "Java (Gradle)", command: "./gradlew", args: ["testClasses"], display: "./gradlew testClasses" };
  }
  return { label: "Java (Gradle)", command: "gradle", args: ["testClasses"], display: "gradle testClasses" };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function runCommand(command: string, args: readonly string[], cwd: string): Promise<{ readonly ok: boolean; readonly output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = appendLimited(output, chunk.toString("utf8"));
    });
    child.on("error", (error) => resolve({ ok: false, output: error.message }));
    child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
  });
}

function appendLimited(base: string, chunk: string): string {
  const next = `${base}${chunk}`;
  return next.length > maxOutput ? `${next.slice(0, maxOutput)}\n[truncated]` : next;
}

type ErrnoException = Error & {
  readonly code: string;
};

function isErrnoException(error: unknown): error is ErrnoException {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
