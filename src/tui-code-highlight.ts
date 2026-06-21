import { ansi, paint } from "./ansi.js";

type LanguageFamily =
  | "shell"
  | "java"
  | "typescript"
  | "python"
  | "go"
  | "rust"
  | "json"
  | "yaml"
  | "toml"
  | "sql"
  | "plain";

const languageAliases: Readonly<Record<string, LanguageFamily>> = {
  bash: "shell",
  sh: "shell",
  shell: "shell",
  zsh: "shell",
  java: "java",
  js: "typescript",
  javascript: "typescript",
  jsx: "typescript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  go: "go",
  rs: "rust",
  rust: "rust",
  json: "json",
  jsonc: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sql: "sql",
} as const;

const languageKeywords: Readonly<Record<LanguageFamily, readonly string[]>> = {
  shell: ["case", "do", "done", "elif", "else", "esac", "export", "fi", "for", "function", "if", "in", "local", "then", "while"],
  java: ["abstract", "boolean", "break", "case", "catch", "class", "const", "continue", "default", "else", "enum", "extends", "final", "finally", "for", "if", "implements", "import", "instanceof", "interface", "new", "package", "private", "protected", "public", "return", "static", "switch", "this", "throw", "throws", "try", "void", "while"],
  typescript: ["async", "await", "break", "case", "catch", "class", "const", "continue", "default", "else", "export", "extends", "finally", "for", "from", "function", "if", "import", "interface", "let", "new", "private", "public", "readonly", "return", "satisfies", "switch", "throw", "try", "type", "while"],
  python: ["and", "as", "async", "await", "break", "class", "continue", "def", "elif", "else", "except", "False", "finally", "for", "from", "if", "import", "in", "is", "lambda", "None", "not", "or", "pass", "raise", "return", "True", "try", "while", "with", "yield"],
  go: ["break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough", "for", "func", "go", "if", "import", "interface", "map", "package", "range", "return", "select", "struct", "switch", "type", "var"],
  rust: ["as", "async", "await", "break", "const", "continue", "crate", "else", "enum", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "trait", "type", "unsafe", "use", "where", "while"],
  json: ["false", "null", "true"],
  yaml: ["false", "no", "null", "off", "on", "true", "yes"],
  toml: ["false", "true"],
  sql: ["alter", "and", "as", "by", "create", "delete", "drop", "from", "group", "having", "in", "insert", "into", "join", "left", "limit", "not", "null", "on", "or", "order", "right", "select", "set", "table", "update", "values", "where"],
  plain: [],
} as const;

export function highlightCodeLine(line: string, language: string): string {
  const family = languageAliases[language.toLowerCase()] ?? "plain";
  if (family === "plain") {
    return paint(line, ansi.yellow);
  }
  if (family === "shell") {
    return highlightShellLine(line);
  }
  return highlightGenericLine(line, languageKeywords[family], family);
}

function highlightShellLine(line: string): string {
  const commentIndex = line.indexOf("#");
  const commandPart = commentIndex === -1 ? line : line.slice(0, commentIndex);
  const commentPart = commentIndex === -1 ? "" : line.slice(commentIndex);
  return `${highlightGenericLine(commandPart, languageKeywords.shell, "shell")}${paint(commentPart, ansi.guide)}`;
}

function highlightGenericLine(
  line: string,
  keywords: readonly string[],
  family: LanguageFamily,
): string {
  const comment = splitTrailingComment(line, family);
  if (comment !== undefined) {
    return `${highlightGenericLine(comment.code, keywords, family)}${paint(comment.comment, ansi.guide)}`;
  }

  const keywordPattern = keywords.length === 0 ? undefined : new RegExp(`\\b(${keywords.join("|")})\\b`, family === "sql" ? "iu" : "u");
  const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[A-Za-z_$][\w$-]*)/gu;
  let result = "";
  let cursor = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index;
    result += line.slice(cursor, index);
    result += paintToken(token, keywordPattern, family);
    cursor = index + token.length;
  }
  return `${result}${line.slice(cursor)}`;
}

function splitTrailingComment(
  line: string,
  family: LanguageFamily,
): { readonly code: string; readonly comment: string } | undefined {
  const marker = commentMarkerFor(family);
  if (marker === undefined) {
    return undefined;
  }
  const index = line.indexOf(marker);
  if (index === -1) {
    return undefined;
  }
  return { code: line.slice(0, index), comment: line.slice(index) };
}

function commentMarkerFor(family: LanguageFamily): string | undefined {
  switch (family) {
    case "java":
    case "typescript":
    case "go":
    case "rust":
      return "//";
    case "python":
    case "yaml":
    case "toml":
      return "#";
    case "sql":
      return "--";
    case "json":
    case "plain":
    case "shell":
      return undefined;
  }
}

function paintToken(token: string, keywordPattern: RegExp | undefined, family: LanguageFamily): string {
  if (isQuoted(token)) {
    return paint(token, ansi.green);
  }
  if (/^\d/u.test(token)) {
    return paint(token, ansi.accent);
  }
  if (isLiteral(token, family)) {
    return paint(token, ansi.accent);
  }
  if (keywordPattern?.test(token) === true) {
    keywordPattern.lastIndex = 0;
    return paint(token, ansi.blue);
  }
  return paint(token, token.startsWith("$") ? ansi.accent : ansi.yellow);
}

function isQuoted(token: string): boolean {
  return token.startsWith("\"") || token.startsWith("'") || token.startsWith("`");
}

function isLiteral(token: string, family: LanguageFamily): boolean {
  if (family === "json" || family === "toml" || family === "yaml") {
    return /^(false|null|no|off|on|true|yes)$/iu.test(token);
  }
  return /^(False|None|True|false|null|self|this|true)$/u.test(token);
}
