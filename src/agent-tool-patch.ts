export type FilePatch = {
  readonly path: string;
  readonly hunks: readonly Hunk[];
};

export type Hunk = {
  readonly oldStart: number;
  readonly lines: readonly string[];
};

export function parseUnifiedPatch(patch: string): readonly FilePatch[] {
  const lines = patch.replace(/\r\n/gu, "\n").split("\n");
  const files: FilePatch[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index]?.startsWith("--- ")) {
      index += 1;
      continue;
    }
    index += 1;
    const nextPath = lines[index];
    if (nextPath === undefined || !nextPath.startsWith("+++ ")) {
      throw new Error("Invalid patch: missing +++ file header");
    }
    const filePath = normalizePatchPath(nextPath.slice(4).trim());
    index += 1;
    const hunks: Hunk[] = [];
    while (index < lines.length && !lines[index]?.startsWith("--- ")) {
      const header = lines[index] ?? "";
      if (!header.startsWith("@@ ")) {
        index += 1;
        continue;
      }
      const oldStart = parseHunkStart(header);
      index += 1;
      const hunkLines: string[] = [];
      while (index < lines.length && !lines[index]?.startsWith("@@ ") && !lines[index]?.startsWith("--- ")) {
        const line = lines[index] ?? "";
        if (line.length > 0 && (line[0] === " " || line[0] === "-" || line[0] === "+")) {
          hunkLines.push(line);
        }
        index += 1;
      }
      hunks.push({ oldStart, lines: hunkLines });
    }
    files.push({ path: filePath, hunks });
  }
  if (files.length === 0) {
    throw new Error("Invalid patch: no file hunks found");
  }
  return files;
}

export function applyHunks(source: readonly string[], hunks: readonly Hunk[], path: string): readonly string[] {
  const output: string[] = [];
  let cursor = 0;
  for (const hunk of hunks) {
    const target = Math.max(0, hunk.oldStart - 1);
    output.push(...source.slice(cursor, target));
    cursor = target;
    for (const line of hunk.lines) {
      const marker = line[0];
      const text = line.slice(1);
      if (marker === " " || marker === "-") {
        if (source[cursor] !== text) {
          throw new Error(`Patch context mismatch in ${path}: expected "${text}"`);
        }
        if (marker === " ") {
          output.push(text);
        }
        cursor += 1;
      } else if (marker === "+") {
        output.push(text);
      }
    }
  }
  output.push(...source.slice(cursor));
  return output;
}

export function splitPatchLines(content: string): readonly string[] {
  const normalized = content.replace(/\r\n/gu, "\n");
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}

function parseHunkStart(header: string): number {
  const match = /^@@ -(?<start>\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/u.exec(header);
  const start = match?.groups?.["start"];
  if (start === undefined) {
    throw new Error(`Invalid patch hunk header: ${header}`);
  }
  return Number.parseInt(start, 10);
}

function normalizePatchPath(path: string): string {
  if (path.startsWith("b/") || path.startsWith("a/")) {
    return path.slice(2);
  }
  return path;
}
