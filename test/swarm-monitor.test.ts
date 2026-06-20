import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { renderSwarmMonitorSnapshot } from "../src/swarm-monitor.js";

test("renderSwarmMonitorSnapshot displays lane status, progress, and synthesis state", () => {
  const rendered = stripAnsi(renderSwarmMonitorSnapshot({
    goal: "Build the explosive swarm runtime with monitoring",
    startedAt: 1000,
    now: 2500,
    synthesisStatus: "running",
    lanes: [
      {
        id: "lane-1",
        index: 1,
        title: "Tech Lead",
        status: "running",
        characters: 1536,
        startedAt: 1000,
        finishedAt: undefined,
      },
      {
        id: "lane-2",
        index: 2,
        title: "Security Reviewer",
        status: "done",
        characters: 420,
        startedAt: 1100,
        finishedAt: 2300,
      },
    ],
  }));

  assert.match(rendered, /Swarm Monitor/u);
  assert.match(rendered, /1 active/u);
  assert.match(rendered, /1\/2 done/u);
  assert.match(rendered, /RUNNING/u);
  assert.match(rendered, /DONE/u);
  assert.match(rendered, /1\.5k chars/u);
  assert.match(rendered, /merging parallel outputs/u);
  assert.match(rendered, /token mixing radar online/u);
});
