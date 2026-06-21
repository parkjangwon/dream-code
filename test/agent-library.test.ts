import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAgentDefinitions } from "../src/agent-definition-loader.js";
import {
  agentFilePath,
  agentLocations,
  customAgentTemplate,
  defaultAgentTemplates,
  renderAgentTemplate,
  writeAgentTemplate,
} from "../src/agent-library.js";

test("defaultAgentTemplates include reviewer roles", () => {
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

test("agentFilePath separates project and personal agent locations", () => {
  assert.equal(
    agentFilePath("/tmp/dream", "/repo", agentLocations.project, "code-reviewer"),
    "/repo/.dream/agents/code-reviewer.md",
  );
  assert.equal(
    agentFilePath("/tmp/dream", "/repo", agentLocations.personal, "code-reviewer"),
    "/tmp/dream/agents/code-reviewer.md",
  );
});

test("loadAgentDefinitions includes built-in and saved agents", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-agent-library-"));
  const projectRoot = await mkdtemp(join(tmpdir(), "dream-agent-project-"));
  try {
    await writeAgentTemplate(
      root,
      projectRoot,
      agentLocations.project,
      customAgentTemplate("Release Captain", "Coordinate release checks.", "Ship carefully."),
    );

    const agents = await loadAgentDefinitions(root, projectRoot);
    const releaseCaptain = agents.find((agent) => agent.id === "release-captain");

    assert.equal(agents.some((agent) => agent.id === "code-reviewer"), true);
    assert.equal(releaseCaptain?.source, "project");
    assert.equal(releaseCaptain?.prompt, "Ship carefully.");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
