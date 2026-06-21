import test from "node:test";
import assert from "node:assert/strict";

import { ansi, paint } from "../src/ansi.js";
import { highlightCodeLine } from "../src/tui-code-highlight.js";

test("highlightCodeLine highlights common language keywords", () => {
  const cases = [
    { language: "bash", line: "if test -f package.json; then echo ok; fi", keyword: "if" },
    { language: "java", line: "public class App { return 1; }", keyword: "public" },
    { language: "ts", line: "export const value = 1", keyword: "export" },
    { language: "python", line: "def run(): return True", keyword: "def" },
    { language: "go", line: "func main() { return }", keyword: "func" },
    { language: "rust", line: "pub fn run() -> bool { true }", keyword: "pub" },
    { language: "sql", line: "select * from users where id = 1", keyword: "select" },
  ] as const;

  for (const item of cases) {
    const rendered = highlightCodeLine(item.line, item.language);
    assert.equal(rendered.includes(paint(item.keyword, ansi.blue)), true);
  }
});

test("highlightCodeLine highlights config literals and shell comments", () => {
  assert.equal(highlightCodeLine("\"ok\": true", "json").includes(paint("true", ansi.accent)), true);
  assert.equal(highlightCodeLine("enabled = false", "toml").includes(paint("false", ansi.accent)), true);
  assert.equal(highlightCodeLine("enabled: yes", "yaml").includes(paint("yes", ansi.accent)), true);
  assert.equal(highlightCodeLine("npm test # run suite", "sh").includes(paint("# run suite", ansi.guide)), true);
  assert.equal(highlightCodeLine("return true; // done", "java").includes(paint("// done", ansi.guide)), true);
});
