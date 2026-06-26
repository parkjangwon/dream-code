import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { request } from "undici";

import { startRemoteServer } from "../src/remote-server.js";
import { startSession } from "../src/session-store.js";
import { pairToken, submitCommand, waitForCommandStatus } from "./remote-server-test-helpers.js";

test("remote server streams authenticated command output and keeps command history", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-command-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-command-project-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "555555",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async (input) => {
      input.onChunk?.("working");
      return { sessionId: "session-remote", output: "working done", shouldContinue: true };
    },
  });
  try {
    const token = await pairToken(server.origin, "555555");
    const events = await request(`${server.origin}/api/events`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(events.statusCode, 200);

    const submitted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: project }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

    assert.equal(submitted.statusCode, 202);
    const submittedBody = await submitted.body.json() as { readonly command?: { readonly status?: string } };
    assert.equal(submittedBody.command?.status, "queued");

    const eventText = await readUntil(events.body, "status\":\"done\"");
    assert.match(eventText, /event: command/u);
    assert.match(eventText, /Worker started/u);
    assert.match(eventText, /Output received/u);
    assert.match(eventText, /working done/u);
    assert.match(eventText, /session-remote/u);

    const history = await request(`${server.origin}/api/commands`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.statusCode, 200);
    assert.match(await history.body.text(), /working done/u);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("remote server rejects command cwd outside known remote projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-command-cwd-"));
  const project = await mkdtemp(join(tmpdir(), "dream-remote-command-allowed-"));
  const outside = await mkdtemp(join(tmpdir(), "dream-remote-command-outside-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "343434",
    unsafeAllowNonTailscale: true,
    workspaceRoot: project,
    commandRunner: async () => ({ sessionId: "session-cwd", output: "should not run", shouldContinue: true }),
  });
  try {
    const token = await pairToken(server.origin, "343434");
    const rejected = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: outside }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

    assert.equal(rejected.statusCode, 400);
    assert.match(await rejected.body.text(), /known remote project/u);

    const accepted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: project }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    assert.equal(accepted.statusCode, 202);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("remote server rejects session commands that target another cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-command-session-cwd-"));
  const sessionProject = await mkdtemp(join(tmpdir(), "dream-remote-session-project-"));
  const otherProject = await mkdtemp(join(tmpdir(), "dream-remote-other-project-"));
  const session = await startSession(root, sessionProject);
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "121212",
    unsafeAllowNonTailscale: true,
    workspaceRoot: otherProject,
    commandRunner: async () => ({ sessionId: "session-should-not-run", output: "should not run", shouldContinue: true }),
  });
  try {
    const token = await pairToken(server.origin, "121212");
    const rejected = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: otherProject, sessionId: session.id }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

    assert.equal(rejected.statusCode, 400);
    assert.match(await rejected.body.text(), /session directory/u);

    const accepted = await request(`${server.origin}/api/commands`, {
      method: "POST",
      body: JSON.stringify({ prompt: "/status", cwd: sessionProject, sessionId: session.id }),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    assert.equal(accepted.statusCode, 202);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(sessionProject, { recursive: true, force: true });
    await rm(otherProject, { recursive: true, force: true });
  }
});

test("remote server cancels queued commands before they run", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-cancel-"));
  let releaseFirst: (() => void) | undefined;
  const firstDone = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const started: string[] = [];
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "777777",
    unsafeAllowNonTailscale: true,
    commandRunner: async (input) => {
      started.push(input.prompt);
      if (input.prompt === "first") {
        await firstDone;
      }
      return { sessionId: `session-${input.prompt}`, output: input.prompt, shouldContinue: true };
    },
  });
  try {
    const token = await pairToken(server.origin, "777777");
    await submitCommand(server.origin, token, "first");
    const queued = await submitCommand(server.origin, token, "second");
    assert.equal(queued.command?.status, "queued");

    const cancelled = await request(`${server.origin}/api/commands/${queued.command.id}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(cancelled.statusCode, 200);
    const cancelledBody = await cancelled.body.json() as { readonly command?: { readonly status?: string } };
    assert.equal(cancelledBody.command?.status, "cancelled");

    releaseFirst?.();
    await waitForCommandStatus(server.origin, token, queued.command.id ?? "", "cancelled");
    assert.deepEqual(started, ["first"]);
  } finally {
    releaseFirst?.();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remote server propagates cancellation into running commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-running-cancel-"));
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "222222",
    unsafeAllowNonTailscale: true,
    commandRunner: (input) => new Promise((resolve) => {
      markStarted?.();
      input.signal?.addEventListener("abort", () => {
        resolve({ sessionId: "session-cancelled", output: "aborted", shouldContinue: true });
      }, { once: true });
    }),
  });
  try {
    const token = await pairToken(server.origin, "222222");
    const submitted = await submitCommand(server.origin, token, "long task");
    await started;

    const cancelled = await request(`${server.origin}/api/commands/${submitted.command?.id ?? ""}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(cancelled.statusCode, 200);

    await waitForCommandStatus(server.origin, token, submitted.command?.id ?? "", "cancelled");
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remote server keeps running commands alive after they are assigned to a session", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-session-running-"));
  let releaseCommand: (() => void) | undefined;
  const commandDone = new Promise<void>((resolve) => {
    releaseCommand = resolve;
  });
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "444444",
    unsafeAllowNonTailscale: true,
    commandRunner: async (input) => {
      input.onSession?.("session-running");
      input.onActivity?.({ label: "Tool shell npm test", detail: "Dream Code executed a local tool" });
      await commandDone;
      return { sessionId: "session-running", output: "finished later", shouldContinue: true };
    },
  });
  try {
    const token = await pairToken(server.origin, "444444");
    const submitted = await submitCommand(server.origin, token, "long async task");
    await waitForCommandStatus(server.origin, token, submitted.command?.id ?? "", "running");

    const running = await request(`${server.origin}/api/commands`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await running.body.json() as {
      readonly commands?: readonly {
        readonly id?: string;
        readonly sessionId?: string;
        readonly activity?: readonly { readonly label?: string }[];
      }[];
    };
    const command = body.commands?.find((entry) => entry.id === submitted.command?.id);
    assert.equal(command?.sessionId, "session-running");
    assert.equal(command?.activity?.some((entry) => entry.label === "Tool shell npm test"), true);

    releaseCommand?.();
    await waitForCommandStatus(server.origin, token, submitted.command?.id ?? "", "done");
  } finally {
    releaseCommand?.();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remote server restores command history after daemon restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-persist-"));
  const options = {
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "888888",
    unsafeAllowNonTailscale: true,
    commandRunner: async () => ({ sessionId: "session-persisted", output: "persisted output", shouldContinue: true }),
  } as const;
  const firstServer = await startRemoteServer(options);
  try {
    const token = await pairToken(firstServer.origin, "888888");
    const submitted = await submitCommand(firstServer.origin, token, "/status");
    await waitForCommandStatus(firstServer.origin, token, submitted.command?.id ?? "", "done");
  } finally {
    await firstServer.close();
  }

  const secondServer = await startRemoteServer(options);
  try {
    const token = await pairToken(secondServer.origin, "888888");
    const history = await request(`${secondServer.origin}/api/commands`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(history.statusCode, 200);
    const text = await history.body.text();
    assert.match(text, /persisted output/u);
    assert.match(text, /session-persisted/u);
  } finally {
    await secondServer.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("remote server writes auditable command action records", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-remote-audit-"));
  const server = await startRemoteServer({
    configRoot: root,
    bindHost: "127.0.0.1",
    port: 0,
    pairingCode: "999999",
    unsafeAllowNonTailscale: true,
    commandRunner: async () => ({ sessionId: "session-audit", output: "audit output", shouldContinue: true }),
  });
  try {
    const unauthorized = await request(`${server.origin}/api/audit`);
    assert.equal(unauthorized.statusCode, 401);

    const token = await pairToken(server.origin, "999999");
    const submitted = await submitCommand(server.origin, token, "audit me");
    await waitForCommandStatus(server.origin, token, submitted.command?.id ?? "", "done");

    const audit = await request(`${server.origin}/api/audit`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(audit.statusCode, 200);
    const body = await audit.body.json() as {
      readonly records?: readonly {
        readonly action?: string;
        readonly commandId?: string;
        readonly status?: string;
      }[];
    };
    assert.equal(body.records?.some((record) => record.action === "command.submitted" && record.commandId === submitted.command?.id), true);
    assert.equal(body.records?.some((record) => record.action === "command.completed" && record.status === "done"), true);

    const auditFile = await readFile(join(root, "webapp", "remote-audit.jsonl"), "utf8");
    assert.match(auditFile, /command\.submitted/u);
    assert.match(auditFile, /command\.completed/u);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function readUntil(body: NodeJS.ReadableStream, needle: string): Promise<string> {
  let text = "";
  for await (const chunk of body) {
    text = `${text}${Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)}`;
    if (text.includes(needle)) {
      return text;
    }
  }
  return text;
}
