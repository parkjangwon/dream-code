import assert from "node:assert/strict";
import test from "node:test";

import {
  agentFilePath,
  agentLocations,
  customAgentTemplate,
  defaultAgentTemplates,
  renderAgentTemplate,
} from "../src/agent-library.js";

test("defaultAgentTemplates include Claude-style reviewer roles", () => {
  const ids = defaultAgentTemplates().map((template) => template.id);

  assert.deepEqual(ids.includes("code-reviewer"), true);
  assert.deepEqual(ids.includes("security-reviewer"), true);
  assert.deepEqual(ids.includes("tech-lead"), true);
});

test("renderAgentTemplate writes markdown with frontmatter metadata", () => {
  const template = customAgentTemplate("UX Reviewer", "Review interface polish.", "Review the TUI.");
  const rendered = renderAgentTemplate(template);

  assert.match(rendered, /^---\n/u);
  assert.match(rendered, /name: ux-reviewer/u);
  assert.match(rendered, /displayName: UX Reviewer/u);
  assert.match(rendered, /tools: read, edit, shell/u);
  assert.match(rendered, /Review the TUI\./u);
});

test("agentFilePath separates project and personal crew locations", () => {
  assert.equal(
    agentFilePath("/tmp/dream", "/repo", agentLocations.project, "code-reviewer"),
    "/repo/.dream/agents/code-reviewer.md",
  );
  assert.equal(
    agentFilePath("/tmp/dream", "/repo", agentLocations.personal, "code-reviewer"),
    "/tmp/dream/agents/code-reviewer.md",
  );
});
