import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { renderSwarmMonitorSnapshot } from "../src/swarm-monitor-render.js";

test("renderSwarmMonitorSnapshot shows an armed escape stop hint", () => {
  const rendered = stripAnsi(renderSwarmMonitorSnapshot({
    goal: "Stop hint",
    startedAt: 1000,
    now: 1100,
    frame: 1,
    synthesisStatus: "waiting",
    selectedIndex: 1,
    view: "monitor",
    interactive: true,
    abortArmed: true,
    maxVisibleLanes: undefined,
    synthesisStartedAt: undefined,
    synthesisFinishedAt: undefined,
    lanes: [
      {
        id: "lane-1",
        index: 1,
        title: "Tech Lead",
        status: "running",
        characters: 0,
        preview: "",
        startedAt: 1000,
        finishedAt: undefined,
      },
    ],
  }));

  assert.match(rendered, /esc again stop swarm/u);
});
