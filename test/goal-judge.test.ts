import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGoalJudgeMessages,
  parseGoalJudgeVerdict,
  summarizeGoalTranscript,
} from "../src/goal-judge.js";

test("goal judge builds compact independent verdict prompts", () => {
  const messages = buildGoalJudgeMessages({
    goal: "Ship the harness",
    transcript: [
      { role: "user", content: "Fix the tests" },
      { role: "assistant", content: "Tests pass and the patch is committed." },
    ],
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0]?.content ?? "", /independent goal judge/u);
  assert.match(messages[1]?.content ?? "", /Ship the harness/u);
  assert.match(messages[1]?.content ?? "", /Tests pass/u);
});

test("goal judge parses strict json and degrades to incomplete on noisy output", () => {
  assert.deepEqual(parseGoalJudgeVerdict('{"satisfied":true,"confidence":0.91,"reason":"done"}'), {
    satisfied: true,
    confidence: 0.91,
    reason: "done",
  });
  assert.deepEqual(parseGoalJudgeVerdict("not json"), {
    satisfied: false,
    confidence: 0,
    reason: "Goal judge returned an unreadable verdict.",
  });
});

test("goal transcript summary preserves recent turns within a token-saving budget", () => {
  const transcript = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "user" as const : "assistant" as const,
    content: `turn-${index} ${"x".repeat(80)}`,
  }));
  const summary = summarizeGoalTranscript(transcript, 260);

  assert.doesNotMatch(summary, /turn-0/u);
  assert.match(summary, /turn-11/u);
  assert.ok(summary.length <= 320);
});
