import assert from "node:assert/strict";
import test from "node:test";

import { cleanRemoteCommandOutput } from "../src/remote-command-output.js";

test("cleanRemoteCommandOutput removes accumulated spinner status frames", () => {
  // Given: mobile remote captured terminal progress frames as append-only output.
  const dirtyOutput = [
    "\u001B[?25l\r⠋ Thinking AUTO deep · high → openai/gpt-5.5",
    "\n⠙ Thinking. AUTO deep · high → openai/gpt-5.5",
    "\n⠹ Thinking.. AUTO deep · high → openai/gpt-5.5",
    "\n완료했습니다.\n",
    "| 구분 | 내용 |\n",
    "| --- | --- |\n",
    "| 결과 | 성공 |\n",
  ].join("");

  // When: the remote output is normalized for storage or rendering.
  const cleanOutput = cleanRemoteCommandOutput(dirtyOutput);

  // Then: transient status frames are removed while the real answer stays intact.
  assert.doesNotMatch(cleanOutput, /Thinking/u);
  assert.doesNotMatch(cleanOutput, /openai\/gpt-5\.5/u);
  assert.match(cleanOutput, /완료했습니다/u);
  assert.match(cleanOutput, /\| 구분 \| 내용 \|/u);
});

test("cleanRemoteCommandOutput unwraps saved TUI response chrome", () => {
  const dirtyOutput = [
    "⠋ Thinking AUTO deep · high → openai/gpt-5.5",
    "⣿ Dream AUTO deep · high → openai/gpt-5.5",
    "│ 완료했습니다.",
    "│ ",
    "│ 주요 구현:",
    "│ • Next.js App Router 기반",
    "│ ",
    "│ 검증한 명령:",
    "│ ╭─ bash",
    "│   npm run build --prefix instagram-clone",
    "│ ╰─",
    "✓ Done 18.5s · ~220 tokens",
    "◆ Tool read package.json",
  ].join("\n");

  const cleanOutput = cleanRemoteCommandOutput(dirtyOutput);

  assert.equal(cleanOutput, [
    "완료했습니다.",
    "",
    "주요 구현:",
    "- Next.js App Router 기반",
    "",
    "검증한 명령:",
    "```bash",
    "npm run build --prefix instagram-clone",
    "```",
  ].join("\n"));
});

test("cleanRemoteCommandOutput keeps the newest carriage-return line", () => {
  // Given: a terminal line was updated in place before the final result.
  const dirtyOutput = "Thinking\rDone\n";

  // When: carriage-return semantics are applied.
  const cleanOutput = cleanRemoteCommandOutput(dirtyOutput);

  // Then: stale overwritten text is not preserved.
  assert.equal(cleanOutput, "Done\n");
});
