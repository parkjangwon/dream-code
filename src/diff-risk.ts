import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DiffRiskStatus = "pass" | "warn";

export type DiffRiskSignal =
  | "no-changes"
  | "source-and-test"
  | "source-without-tests"
  | "package-surface"
  | "large-diff"
  | "docs-only";

export type DiffRiskAssessment = {
  readonly status: DiffRiskStatus;
  readonly detail: string;
  readonly files: readonly string[];
  readonly signals: readonly DiffRiskSignal[];
};

export async function changedFilesForGit(cwd: string): Promise<readonly string[]> {
  const [working, staged, untracked] = await Promise.all([
    gitLines(cwd, ["diff", "--name-only", "--diff-filter=ACMRTUXB"]),
    gitLines(cwd, ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB"]),
    gitLines(cwd, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return unique([...working, ...staged, ...untracked]);
}

export function analyzeDiffRisk(files: readonly string[]): DiffRiskAssessment {
  const normalized = unique(files.map((file) => file.trim()).filter((file) => file.length > 0));
  if (normalized.length === 0) {
    return { status: "pass", detail: "no working tree changes", files: normalized, signals: ["no-changes"] };
  }

  const signals = diffSignals(normalized);
  const status = signals.includes("source-without-tests")
    || signals.includes("package-surface")
    || signals.includes("large-diff")
    ? "warn"
    : "pass";
  return {
    status,
    detail: diffRiskDetail(normalized, signals),
    files: normalized,
    signals,
  };
}

async function gitLines(cwd: string, args: readonly string[]): Promise<readonly string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.split(/\r?\n/u).filter((line) => line.length > 0);
  } catch (error) {
    if (error instanceof Error) {
      return [];
    }
    throw error;
  }
}

function diffSignals(files: readonly string[]): readonly DiffRiskSignal[] {
  const signals: DiffRiskSignal[] = [];
  const hasSource = files.some(isSourceFile);
  const hasTests = files.some(isTestFile);
  const hasPackageSurface = files.some(isPackageSurface);
  const docsOnly = files.every(isDocFile);
  if (hasSource && hasTests) {
    signals.push("source-and-test");
  }
  if (hasSource && !hasTests) {
    signals.push("source-without-tests");
  }
  if (hasPackageSurface) {
    signals.push("package-surface");
  }
  if (files.length > 25) {
    signals.push("large-diff");
  }
  if (docsOnly) {
    signals.push("docs-only");
  }
  return signals.length === 0 ? ["no-changes"] : signals;
}

function diffRiskDetail(files: readonly string[], signals: readonly DiffRiskSignal[]): string {
  if (signals.includes("source-without-tests")) {
    return `${files.length} changed files; source changed without matching test changes`;
  }
  if (signals.includes("package-surface")) {
    return `${files.length} changed files; package or lockfile surface changed`;
  }
  if (signals.includes("large-diff")) {
    return `${files.length} changed files; broad diff needs reviewer attention`;
  }
  if (signals.includes("source-and-test")) {
    return `${files.length} changed files; source changes include test coverage`;
  }
  if (signals.includes("docs-only")) {
    return `${files.length} documentation-only changed files`;
  }
  return `${files.length} changed files`;
}

function isSourceFile(file: string): boolean {
  return file.startsWith("src/") && /\.(ts|tsx|mts|cts)$/u.test(file);
}

function isTestFile(file: string): boolean {
  return file.startsWith("test/") || /\.(test|spec)\.(ts|tsx|mts|cts)$/u.test(file);
}

function isPackageSurface(file: string): boolean {
  return ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"].includes(file);
}

function isDocFile(file: string): boolean {
  return /\.(md|mdx|txt)$/u.test(file);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
