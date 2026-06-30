const ansiEscapePattern = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const providerModelPattern = /\b[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\b/iu;

export function cleanRemoteCommandOutput(output: string): string {
  const withoutAnsi = output.replace(ansiEscapePattern, "").replace(/\u0008/gu, "");
  const terminalText = applyCarriageReturnSemantics(withoutAnsi);
  const hadTrailingNewline = terminalText.endsWith("\n");
  const lines = terminalText.split("\n");
  const sourceLines = hadTrailingNewline ? lines.slice(0, -1) : lines;
  const cleanLines = normalizeResponseChrome(sourceLines);
  return `${cleanLines.join("\n")}${hadTrailingNewline && cleanLines.length > 0 ? "\n" : ""}`;
}

function applyCarriageReturnSemantics(text: string): string {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    if (character === "\r") {
      current = "";
    } else if (character === "\n") {
      lines.push(current);
      current = "";
    } else {
      current = `${current}${character}`;
    }
  }
  return text.endsWith("\n") ? `${lines.join("\n")}\n` : [...lines, current].join("\n");
}

function isTransientRouteStatus(line: string): boolean {
  const text = line.replace(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/u, "").trim();
  if (text.length === 0) {
    return false;
  }
  const hasRoute = /\bAUTO\b/u.test(text) && text.includes("→") && providerModelPattern.test(text);
  return hasRoute || (/^Thinking\.{0,3}\b/u.test(text) && providerModelPattern.test(text));
}

function normalizeResponseChrome(lines: readonly string[]): readonly string[] {
  const cleanLines: string[] = [];
  let inBoxCode = false;
  for (const line of lines) {
    const unwrapped = unwrapRailLine(line);
    const text = unwrapped.trim();
    if (isTransientRouteStatus(unwrapped) || isProgressOnlyLine(text)) {
      continue;
    }
    if (/^╭─/u.test(text)) {
      cleanLines.push(`\`\`\`${text.replace(/^╭─\s*/u, "")}`.trimEnd());
      inBoxCode = true;
      continue;
    }
    if (/^╰─/u.test(text)) {
      cleanLines.push("```");
      inBoxCode = false;
      continue;
    }
    if (inBoxCode) {
      cleanLines.push(unwrapped.trim());
      continue;
    }
    cleanLines.push(unwrapped.replace(/^•\s+/u, "- "));
  }
  return trimBlankEdges(cleanLines);
}

function unwrapRailLine(line: string): string {
  return line.replace(/^\s*│ ?/u, "");
}

function isProgressOnlyLine(text: string): boolean {
  return /^✓ Done\b/u.test(text)
    || /^◆ Tool\b/u.test(text)
    || /^◇ Tools queued\b/u.test(text)
    || /^Tool\s+\S+/u.test(text);
}

function trimBlankEdges(lines: readonly string[]): readonly string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim().length === 0) {
    start += 1;
  }
  while (end > start && (lines[end - 1] ?? "").trim().length === 0) {
    end -= 1;
  }
  return lines.slice(start, end);
}
