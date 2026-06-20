import test from "node:test";
import assert from "node:assert/strict";

import { createAgentMessages } from "../src/agent-runner.js";

test("createAgentMessages keeps prompts minimal for token-saving startup", () => {
  const messages = createAgentMessages("fix tests");

  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.role, "user");
  assert.equal(messages[1]?.content, "fix tests");
  assert.match(messages[0]?.content ?? "", /fast coding harness/i);
});
