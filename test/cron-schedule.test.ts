import assert from "node:assert/strict";
import test from "node:test";

import { nextCronRun, parseCronDraft } from "../src/cron-schedule.js";

test("nextCronRun returns the next daily run when the time is still ahead", () => {
  const now = new Date("2026-06-21T08:30:00.000Z");

  const next = nextCronRun("0 9 * * *", now);

  assert.equal(next?.toISOString(), "2026-06-21T09:00:00.000Z");
});

test("nextCronRun rolls daily schedules to tomorrow when today's time passed", () => {
  const now = new Date("2026-06-21T09:30:00.000Z");

  const next = nextCronRun("0 9 * * *", now);

  assert.equal(next?.toISOString(), "2026-06-22T09:00:00.000Z");
});

test("nextCronRun handles interval minute schedules", () => {
  const now = new Date("2026-06-21T09:07:10.000Z");

  const next = nextCronRun("*/15 * * * *", now);

  assert.equal(next?.toISOString(), "2026-06-21T09:15:00.000Z");
});

test("parseCronDraft extracts a daily job draft from natural language", () => {
  const draft = parseCronDraft("every day at 09:00 run tests and summarize failures", "/repo/dream-code");

  assert.equal(draft.projectName, "dream-code");
  assert.equal(draft.schedule, "0 9 * * *");
  assert.equal(draft.prompt, "run tests and summarize failures");
});

