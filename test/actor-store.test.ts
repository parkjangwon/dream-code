import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listActors, registerActor, updateActorStatus } from "../src/actor-store.js";
import { drainInboxMessages, sendInboxMessage } from "../src/inbox-store.js";

test("actor store registers lifecycle records and inbox messages", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-actors-"));
  try {
    const actor = await registerActor(root, {
      id: "actor-1",
      sessionId: "session-a",
      role: "subagent",
      name: "Security Reviewer",
      task: "Audit the repository",
      runId: "run-1",
    });
    await updateActorStatus(root, actor.id, "done", { summary: "No secrets found." });
    await sendInboxMessage(root, {
      id: "msg-1",
      receiverActorId: actor.id,
      senderActorId: "main",
      type: "user",
      content: "Check dependencies too.",
    });

    const actors = await listActors(root);
    const messages = await drainInboxMessages(root, actor.id);

    assert.equal(actors.length, 1);
    assert.equal(actors[0]?.status, "done");
    assert.equal(actors[0]?.summary, "No secrets found.");
    assert.equal(messages[0]?.content, "Check dependencies too.");

    const inbox = await readFile(join(root, "actors", "inbox.jsonl"), "utf8");
    assert.match(inbox, /"deliveredAt"/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
