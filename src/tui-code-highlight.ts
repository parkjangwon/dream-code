import { highlight, supportsLanguage } from "cli-highlight";
import type { Theme } from "cli-highlight";

import { ansi, paint } from "./ansi.js";

const languageAliases: Readonly<Record<string, string>> = {
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  java: "java",
  js: "javascript",
  javascript: "javascript",
  jsx: "javascript",
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

const dreamTheme: Theme = {
  default: (text) => paint(text, ansi.yellow),
  keyword: (text) => paint(text, ansi.blue),
  built_in: (text) => paint(text, ansi.muted),
  type: (text) => paint(text, ansi.accent),
  literal: (text) => paint(text, ansi.accent),
  number: (text) => paint(text, ansi.accent),
  regexp: (text) => paint(text, ansi.green),
  string: (text) => paint(text, ansi.green),
  subst: (text) => paint(text, ansi.accent),
  symbol: (text) => paint(text, ansi.accent),
  class: (text) => paint(text, ansi.accent),
  function: (text) => paint(text, ansi.accent),
  title: (text) => paint(text, ansi.accent),
  params: (text) => paint(text, ansi.yellow),
  comment: (text) => paint(text, ansi.guide),
  doctag: (text) => paint(text, ansi.muted),
  meta: (text) => paint(text, ansi.muted),
  "meta-keyword": (text) => paint(text, ansi.blue),
  "meta-string": (text) => paint(text, ansi.green),
  section: (text) => paint(text, ansi.accent),
  tag: (text) => paint(text, ansi.blue),
  name: (text) => paint(text, ansi.blue),
  "builtin-name": (text) => paint(text, ansi.muted),
  attr: (text) => paint(text, ansi.blue),
  attribute: (text) => paint(text, ansi.blue),
  variable: (text) => paint(text, ansi.accent),
  bullet: (text) => paint(text, ansi.guide),
  code: (text) => paint(text, ansi.yellow),
  emphasis: (text) => paint(text, ansi.accent),
  strong: (text) => paint(text, ansi.bold),
  formula: (text) => paint(text, ansi.yellow),
  link: (text) => paint(text, ansi.blue),
  quote: (text) => paint(text, ansi.guide),
  "selector-tag": (text) => paint(text, ansi.blue),
  "selector-id": (text) => paint(text, ansi.accent),
  "selector-class": (text) => paint(text, ansi.accent),
  "selector-attr": (text) => paint(text, ansi.blue),
  "selector-pseudo": (text) => paint(text, ansi.muted),
  "template-tag": (text) => paint(text, ansi.blue),
  "template-variable": (text) => paint(text, ansi.accent),
  addition: (text) => paint(text, ansi.green),
  deletion: (text) => paint(text, ansi.red),
};

export function highlightCodeLine(line: string, language: string): string {
  if (line.length === 0) {
    return "";
  }

  const normalized = normalizeLanguage(language);
  if (normalized === undefined) {
    return paint(line, ansi.yellow);
  }

  try {
    return highlight(line, {
      language: normalized,
      ignoreIllegals: true,
      theme: dreamTheme,
    });
  } catch (error) {
    if (error instanceof Error) {
      return paint(line, ansi.yellow);
    }
    throw error;
  }
}

function normalizeLanguage(language: string): string | undefined {
  const normalized = languageAliases[language.toLowerCase()] ?? language.toLowerCase();
  return supportsLanguage(normalized) ? normalized : undefined;
}
