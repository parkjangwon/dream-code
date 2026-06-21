import test from "node:test";
import assert from "node:assert/strict";

import { ansi, paint, stripAnsi } from "../src/ansi.js";
import type { SelectedModel } from "../src/model-routing.js";
import { createAgentResponseSession } from "../src/tui-agent-response.js";

test("agent response session renders thinking, streamed rail, and done summary", () => {
  const chunks: string[] = [];
  let clock = 1_000;
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => clock,
  });

  session.start();
  session.token("Hello\nworld");
  clock = 2_250;
  session.finish();

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /⠋ Thinking openai\/gpt-test · mid/);
  assert.match(output, /⣿ Dream openai\/gpt-test · mid/);
  assert.match(output, /│ Hello\n│ world\n/);
  assert.match(output, /✓ Done 1\.3s · ~3 tokens/);
});

test("agent response session renders provider errors as a response block", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.fail("Missing API key", "warn");

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /⠋ Thinking openai\/gpt-test · mid/);
  assert.match(output, /✕ Error/);
  assert.match(output, /│ Missing API key/);
});

test("agent response session shows auto route and concrete model together", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: {
      provider: "deepseek",
      model: "deepseek-v4-flash",
      tier: "low",
      reason: "auto category: Quick",
      category: "quick",
    },
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("Hi");
  session.finish();

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /AUTO quick · low → deepseek\/deepseek-v4-flash/u);
});

test("agent response session animates thinking in place until the first token", () => {
  const chunks: string[] = [];
  const ticks: Array<() => void> = [];
  const cleared: unknown[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    setInterval: (callback) => {
      ticks.push(callback);
      return ticks.length;
    },
    clearInterval: (handle) => {
      cleared.push(handle);
    },
  });

  session.start();
  ticks[0]?.();
  session.token("Hello");
  ticks[0]?.();

  const rawOutput = chunks.join("");
  const visibleOutput = stripAnsi(rawOutput);
  assert.equal(rawOutput.includes("\u001B[1A\r\u001B[2K"), true);
  assert.match(visibleOutput, /⠙ Thinking\. openai\/gpt-test · mid/);
  assert.match(visibleOutput, /⣿ Dream openai\/gpt-test · mid/);
  assert.equal(cleared.length, 1);
});

test("agent response session applies lightweight markdown styling", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("### Summary\n- Read `README.md` and `src/`\nUse **bold** and `code`.");
  session.finish();

  const rawOutput = chunks.join("");
  const plainOutput = stripAnsi(rawOutput);
  assert.match(plainOutput, /│ ### Summary/);
  assert.match(plainOutput, /│ • Read `README.md` and `src\/`/);
  assert.equal(rawOutput.includes(paint("README.md", ansi.blue)), true);
  assert.equal(rawOutput.includes(paint("src/", ansi.blue)), true);
  assert.equal(rawOutput.includes(paint("code", ansi.yellow)), true);
  assert.equal(rawOutput.includes(paint("bold", ansi.bold)), true);
});

test("agent response session styles markdown across token boundaries", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("Read `READ");
  session.token("ME.md` before `code`");
  session.finish();

  const rawOutput = chunks.join("");
  const plainOutput = stripAnsi(rawOutput);
  assert.match(plainOutput, /│ Read `README.md` before `code`/);
  assert.equal(rawOutput.includes(paint("README.md", ansi.blue)), true);
  assert.equal(rawOutput.includes(paint("code", ansi.yellow)), true);
});

test("agent response session renders fenced code blocks", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("```bash\nls -la /tmp\n```\nDone");
  session.finish();

  const rawOutput = chunks.join("");
  const plainOutput = stripAnsi(rawOutput);
  assert.match(plainOutput, /│ ╭─ bash\n│   ls -la \/tmp\n│ ╰─\n│ Done/);
  assert.equal(rawOutput.includes(paint("ls -la /tmp", ansi.yellow)), true);
});

test("agent response session collapses dream-tool blocks by default", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token([
    "Checking files.\n",
    "```dream-tool\n",
    "{\"tool\":\"write\",\"path\":\"package.json\",\"content\":\"large hidden content\"}\n",
    "{\"tool\":\"shell\",\"command\":\"find . -maxdepth 2 -type f\"}\n",
    "```\n",
    "Continuing.",
  ].join(""));
  session.finish();

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /│ Checking files\./u);
  assert.match(output, /│ ◇ Tools queued · 2 calls/u);
  assert.match(output, /│ Continuing\./u);
  assert.doesNotMatch(output, /package\.json/u);
  assert.doesNotMatch(output, /large hidden content/u);
  assert.doesNotMatch(output, /find \./u);
});

test("agent response session collapses dream-tool blocks across token boundaries", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("```dream");
  session.token("-tool\n{\"tool\":\"read\",\"path\":\"README.md\"}\n");
  session.token("```\nDone");
  session.finish();

  const output = stripAnsi(chunks.join(""));
  assert.match(output, /│ ◇ Tools queued · 1 call/u);
  assert.match(output, /│ Done/u);
  assert.doesNotMatch(output, /README\.md/u);
});

test("agent response session highlights fenced code by language", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("```java\npublic class App {\n  return 1;\n}\n```\n");
  session.finish();

  const rawOutput = chunks.join("");
  const plainOutput = stripAnsi(rawOutput);
  assert.match(plainOutput, /│ ╭─ java\n│   public class App \{\n│     return 1;\n│   \}\n│ ╰─/);
  assert.equal(rawOutput.includes(paint("public", ansi.blue)), true);
  assert.equal(rawOutput.includes(paint("class", ansi.blue)), true);
  assert.equal(rawOutput.includes(paint("1", ansi.accent)), true);
});

test("agent response session renders markdown tables as terminal rows", () => {
  const chunks: string[] = [];
  const session = createAgentResponseSession({
    selectedModel: selectedModelFixture,
    write: (text) => chunks.push(text),
    now: () => 0,
  });

  session.start();
  session.token("| 파일 경로 | 역할 |\n|---|---|\n| `package.json` | scripts |\n");
  session.finish();

  const rawOutput = chunks.join("");
  const plainOutput = stripAnsi(rawOutput);
  assert.match(plainOutput, /│ │ 파일 경로      │ 역할    │\n│ │ `package\.json` │ scripts │/);
  assert.equal(rawOutput.includes(paint("package.json", ansi.blue)), true);
});

const selectedModelFixture = {
  provider: "openai",
  model: "gpt-test",
  tier: "mid",
  reason: "test",
} satisfies SelectedModel;
