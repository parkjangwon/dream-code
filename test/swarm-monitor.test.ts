import assert from "node:assert/strict";
import test from "node:test";

import { stripAnsi } from "../src/ansi.js";
import { createSwarmMonitor } from "../src/swarm-monitor.js";
import { renderSwarmMonitorSnapshot } from "../src/swarm-monitor-render.js";
import type { SwarmLane } from "../src/swarm-plan.js";

test("renderSwarmMonitorSnapshot displays lane status, progress, and synthesis state", () => {
  const rendered = stripAnsi(renderSwarmMonitorSnapshot({
    goal: "Build the explosive swarm runtime with monitoring",
    startedAt: 1000,
    now: 2500,
    frame: 2,
    synthesisStatus: "running",
    lanes: [
      {
        id: "lane-1",
        index: 1,
        title: "Tech Lead",
        status: "running",
        characters: 1536,
        preview: "Reviewing architecture seams.",
        startedAt: 1000,
        finishedAt: undefined,
      },
      {
        id: "lane-2",
        index: 2,
        title: "Security Reviewer",
        status: "done",
        characters: 420,
        preview: "Security pass complete.",
        startedAt: 1100,
        finishedAt: 2300,
      },
    ],
    selectedIndex: undefined,
    view: "monitor",
    interactive: false,
    abortArmed: false,
    maxVisibleLanes: undefined,
  }));

  assert.match(rendered, /Swarm Monitor/u);
  assert.match(rendered, /1 active/u);
  assert.match(rendered, /1\/2 done/u);
  assert.match(rendered, /RUNNING/u);
  assert.match(rendered, /DONE/u);
  assert.match(rendered, /1\.5k chars/u);
  assert.match(rendered, /parallel lanes mixing/u);
  assert.match(rendered, /merging parallel outputs/u);
  assert.match(rendered, /token mixing radar online/u);
});

test("renderSwarmMonitorSnapshot highlights selected lanes and shows lane details", () => {
  const rendered = stripAnsi(renderSwarmMonitorSnapshot({
    goal: "Ship an absurdly powerful swarm cockpit",
    startedAt: 1000,
    now: 3400,
    frame: 1,
    synthesisStatus: "waiting",
    selectedIndex: 2,
    view: "detail",
    interactive: true,
    abortArmed: false,
    maxVisibleLanes: undefined,
    lanes: [
      {
        id: "lane-1",
        index: 1,
        title: "Tech Lead",
        status: "done",
        characters: 2200,
        preview: "Architecture route is stable.",
        startedAt: 1000,
        finishedAt: 2000,
      },
      {
        id: "lane-2",
        index: 2,
        title: "Code Reviewer",
        status: "running",
        characters: 6700,
        preview: "Checking changed files\nLooking for regressions",
        startedAt: 1100,
        finishedAt: undefined,
      },
    ],
  }));

  assert.match(rendered, /Swarm Lane 02/u);
  assert.match(rendered, /Code Reviewer/u);
  assert.match(rendered, /6\.7k chars/u);
  assert.match(rendered, /Checking changed files/u);
  assert.match(rendered, /esc back/u);
});

test("renderSwarmMonitorSnapshot windows large swarms around the focused lane", () => {
  const rendered = stripAnsi(renderSwarmMonitorSnapshot({
    goal: "Keep a hundred-lane swarm inside the viewport",
    startedAt: 1000,
    now: 2000,
    frame: 1,
    synthesisStatus: "running",
    selectedIndex: 58,
    view: "monitor",
    interactive: true,
    abortArmed: false,
    maxVisibleLanes: 5,
    lanes: Array.from({ length: 100 }, (_item, index) => ({
      id: `lane-${index + 1}`,
      index: index + 1,
      title: "Code Reviewer",
      status: index === 57 ? "running" : "done",
      characters: 100,
      preview: "",
      startedAt: 1000,
      finishedAt: index === 57 ? undefined : 1500,
    })),
  }));

  assert.match(rendered, /↑ 55 lanes above/u);
  assert.match(rendered, /› 58 RUNNING/u);
  assert.match(rendered, /↓ 40 lanes below/u);
  assert.doesNotMatch(rendered, /01 DONE/u);
  assert.doesNotMatch(rendered, /100 DONE/u);
});

test("createSwarmMonitor can redraw the same live panel in place", () => {
  const chunks: string[] = [];
  const lanes: readonly SwarmLane[] = [
    {
      id: "lane-1",
      title: "Tech Lead",
      agent: {
        id: "tech-lead",
        name: "Tech Lead",
        summary: "Plan the work.",
        model: "inherit",
        tools: ["read"],
        prompt: "Plan.",
        source: "built-in",
      },
      prompt: "Plan.",
    },
  ];
  const monitor = createSwarmMonitor({
    goal: "Build a live monitor",
    lanes,
    replaceInPlace: true,
    now: () => 1000,
    write: (chunk) => {
      chunks.push(chunk);
    },
  });

  monitor.start();
  monitor.laneStarted("lane-1");

  assert.equal(chunks.length, 2);
  assert.equal(chunks[1]?.includes("\u001B[1A\r\u001B[2K"), true);
});

test("createSwarmMonitor renders lane progress previews in the cockpit", () => {
  const chunks: string[] = [];
  const lanes: readonly SwarmLane[] = [
    {
      id: "lane-1",
      title: "Security Reviewer",
      agent: {
        id: "security-reviewer",
        name: "Security Reviewer",
        summary: "Audit the work.",
        model: "inherit",
        tools: ["read"],
        prompt: "Audit.",
        source: "built-in",
      },
      prompt: "Audit.",
    },
  ];
  const monitor = createSwarmMonitor({
    goal: "Inspect running lane output",
    lanes,
    now: () => 1000,
    write: (chunk) => {
      chunks.push(stripAnsi(chunk));
    },
  });

  monitor.start();
  monitor.laneStarted("lane-1");
  monitor.laneProgress("lane-1", 600, "Reading package.json");
  monitor.laneDone("lane-1", 900, "Security checklist complete");

  assert.match(chunks.join("\n"), /900 chars/u);
  assert.match(chunks.join("\n"), /DONE/u);
});
