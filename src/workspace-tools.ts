import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type ReadFileResult = {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
  readonly bytes: number;
};

export type EditFileResult = {
  readonly path: string;
  readonly replaced: boolean;
};

export async function readWorkspaceFile(
  inputPath: string,
  maxChars = 8_000,
): Promise<ReadFileResult> {
  const absolutePath = resolve(process.cwd(), inputPath);
  const content = await readFile(absolutePath, "utf8");
  const truncated = content.length > maxChars;

  return {
    path: absolutePath,
    content: truncated ? content.slice(0, maxChars) : content,
    truncated,
    bytes: Buffer.byteLength(content),
  };
}

export async function writeWorkspaceFile(inputPath: string, content: string): Promise<string> {
  const absolutePath = resolve(process.cwd(), inputPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

export async function replaceInWorkspaceFile(
  inputPath: string,
  searchText: string,
  replacementText: string,
): Promise<EditFileResult> {
  const absolutePath = resolve(process.cwd(), inputPath);
  const content = await readFile(absolutePath, "utf8");
  if (!content.includes(searchText)) {
    return { path: absolutePath, replaced: false };
  }

  await writeFile(absolutePath, content.replace(searchText, replacementText), "utf8");
  return { path: absolutePath, replaced: true };
}

export function runShellCommand(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });

    child.once("error", (error) => {
      reject(error);
    });
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}
