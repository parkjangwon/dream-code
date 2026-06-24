import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const maxFileBytes = 10 * 1024 * 1024;

export type RemoteUploadInput = {
  readonly dataBase64: string;
  readonly name: string;
  readonly type?: string | undefined;
};

export type RemoteUploadedFile = {
  readonly name: string;
  readonly path: string;
  readonly mimeType?: string;
  readonly size: number;
};

export async function saveRemoteUploads(cwd: string, files: readonly RemoteUploadInput[]): Promise<readonly RemoteUploadedFile[]> {
  const directory = resolve(cwd, ".dream", "remote-uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const saved: RemoteUploadedFile[] = [];
  for (const [index, file] of files.entries()) {
    const buffer = Buffer.from(file.dataBase64, "base64");
    if (buffer.byteLength > maxFileBytes) {
      throw new RemoteUploadError(`${file.name} is larger than 10 MB.`);
    }
    const name = uploadFileName(file.name, index);
    const path = join(directory, name);
    await writeFile(path, buffer, { mode: 0o600 });
    saved.push({
      name: basename(file.name) || name,
      path,
      ...(file.type === undefined || file.type.length === 0 ? {} : { mimeType: file.type }),
      size: buffer.byteLength,
    });
  }
  return saved;
}

export async function cleanupRemoteUploads(files: readonly RemoteUploadedFile[]): Promise<void> {
  await Promise.all(files.map((file) => rm(file.path, { force: true })));
}

export function appendUploadedFiles(prompt: string, files: readonly RemoteUploadedFile[]): string {
  if (files.length === 0) {
    return prompt;
  }
  const lines = files.map((file) => `- ${file.name}: ${file.path}`);
  return `${prompt}\n\nUploaded files:\n${lines.join("\n")}\n\nUse these temporary file paths while handling this request.`;
}

export class RemoteUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteUploadError";
  }
}

function uploadFileName(name: string, index: number): string {
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]/gu, "").slice(0, 14);
  const safe = basename(name).replace(/[^0-9A-Za-z._-]+/gu, "-").replace(/^-+|-+$/gu, "") || `upload-${index + 1}`;
  return `${stamp}-${index + 1}-${safe}`;
}
