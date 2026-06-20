import type { DreamConfig } from "./config.js";
import type { ModelConfig } from "./model-routing.js";

type TomlScalar = string | number | boolean | readonly string[];
type TomlNode = TomlScalar | TomlObject | readonly TomlObject[];

interface TomlObject {
  [key: string]: TomlNode;
}

export class TomlConfigParseError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "TomlConfigParseError";
  }
}

export function serializeMainConfigToml(config: DreamConfig): string {
  const lines = [
    "version = 1",
    "",
    "[permissions]",
    `mode = ${quote(config.permissions.mode)}`,
    "",
    "[tokenSaving]",
    `enabled = ${config.tokenSaving.enabled}`,
    `contextBudgetPercent = ${config.tokenSaving.contextBudgetPercent}`,
    `preferSummaries = ${config.tokenSaving.preferSummaries}`,
    `useRipgrepFirst = ${config.tokenSaving.useRipgrepFirst}`,
    "",
    "[tools]",
    `ripgrep = ${config.tools.ripgrep}`,
    `lsp = ${config.tools.lsp}`,
    `webResearch = ${config.tools.webResearch}`,
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

export function serializeModelConfigToml(model: ModelConfig): string {
  const lines = [
    "version = 1",
    "",
    "[model]",
    `mode = ${quote(model.mode)}`,
    "",
    "[model.single]",
    `provider = ${quote(model.single.provider)}`,
    `defaultTier = ${quote(model.single.defaultTier)}`,
    "",
    "[model.single.models]",
    `low = ${quote(model.single.models.low)}`,
    `mid = ${quote(model.single.models.mid)}`,
    `high = ${quote(model.single.models.high)}`,
    "",
  ];

  for (const route of model.auto.routes) {
    lines.push(
      "[[model.auto.routes]]",
      `id = ${quote(route.id)}`,
      `provider = ${quote(route.provider)}`,
      `model = ${quote(route.model)}`,
      `tier = ${quote(route.tier)}`,
      `match = ${stringArray(route.match)}`,
      "",
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseConfigToml(raw: string): unknown {
  const root: TomlObject = {};
  let current = root;

  for (const [index, sourceLine] of raw.split(/\r?\n/u).entries()) {
    const line = stripComment(sourceLine).trim();
    if (line.length === 0) {
      continue;
    }
    if (line.startsWith("[[") && line.endsWith("]]")) {
      current = pushArrayTable(root, line.slice(2, -2).trim().split("."));
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      current = ensurePath(root, line.slice(1, -1).trim().split("."));
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      throw new TomlConfigParseError(`Line ${index + 1} is missing '='.`);
    }
    const key = line.slice(0, separator).trim();
    if (key.length === 0) {
      throw new TomlConfigParseError(`Line ${index + 1} has an empty key.`);
    }
    current[key] = parseValue(line.slice(separator + 1).trim(), index + 1);
  }

  return root;
}

function pushArrayTable(root: TomlObject, path: readonly string[]): TomlObject {
  const key = path[path.length - 1];
  if (key === undefined) {
    throw new TomlConfigParseError("Array table path is empty.");
  }
  const parent = ensurePath(root, path.slice(0, -1));
  const existing = parent[key];
  const next: TomlObject = {};
  if (existing === undefined) {
    parent[key] = [next];
    return next;
  }
  if (!isTomlObjectArray(existing)) {
    throw new TomlConfigParseError(`Path '${path.join(".")}' is not an array table.`);
  }
  existing.push(next);
  return next;
}

function ensurePath(root: TomlObject, path: readonly string[]): TomlObject {
  let current = root;
  for (const key of path) {
    const existing = current[key];
    if (isTomlObject(existing)) {
      current = existing;
    } else if (existing === undefined) {
      const next: TomlObject = {};
      current[key] = next;
      current = next;
    } else {
      throw new TomlConfigParseError(`Path '${path.join(".")}' is not a table.`);
    }
  }
  return current;
}

function parseValue(text: string, lineNumber: number): TomlScalar {
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  if (/^-?\d+$/u.test(text)) {
    return Number.parseInt(text, 10);
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    return parseStringArray(text, lineNumber);
  }
  return parseString(text, lineNumber);
}

function parseStringArray(text: string, lineNumber: number): readonly string[] {
  const values: string[] = [];
  const matcher = /"([^"\\]|\\.)*"/gu;
  for (const match of text.matchAll(matcher)) {
    values.push(parseString(match[0] ?? "", lineNumber));
  }
  return values;
}

function parseString(text: string, lineNumber: number): string {
  if (!text.startsWith("\"") || !text.endsWith("\"")) {
    throw new TomlConfigParseError(`Line ${lineNumber} has an unsupported value.`);
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "string") {
    throw new TomlConfigParseError(`Line ${lineNumber} string value could not be parsed.`);
  }
  return parsed;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function stringArray(values: readonly string[]): string {
  return `[${values.map(quote).join(", ")}]`;
}

function stripComment(line: string): string {
  const commentAt = line.indexOf("#");
  return commentAt === -1 ? line : line.slice(0, commentAt);
}

function isTomlObject(value: TomlNode | undefined): value is TomlObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTomlObjectArray(value: TomlNode): value is TomlObject[] {
  return Array.isArray(value) && value.every(isTomlObject);
}
