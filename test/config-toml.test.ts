import test from "node:test";
import assert from "node:assert/strict";

import {
  parseConfigToml,
  serializeMainConfigToml,
  serializeModelConfigToml,
  serializeTeamConfigToml,
} from "../src/config-toml.js";
import { defaultConfig, dreamConfigSchema } from "../src/config.js";

test("TOML serializers split main, model, and team config sections", () => {
  const config = defaultConfig();
  const mainToml = serializeMainConfigToml(config);
  const modelToml = serializeModelConfigToml(config.model);
  const teamToml = serializeTeamConfigToml(config.team);

  assert.match(mainToml, /\[permissions\]/);
  assert.doesNotMatch(mainToml, /\[model\]/);
  assert.match(modelToml, /\[model\.single\.models\]/);
  assert.match(modelToml, /\[\[model\.auto\.routes\]\]/);
  assert.match(teamToml, /\[\[team\]\]/);
});

test("parseConfigToml reads serialized Dream config", () => {
  const config = defaultConfig();
  const main = parseConfigToml(serializeMainConfigToml(config));
  const model = parseConfigToml(serializeModelConfigToml(config.model));
  const team = parseConfigToml(serializeTeamConfigToml(config.team));
  assertRecord(main);
  assertRecord(model);
  assertRecord(team);
  const parsed = dreamConfigSchema.parse({
    ...main,
    ...model,
    ...team,
  });

  assert.equal(parsed.version, 1);
  assert.equal(parsed.permissions.mode, "ask");
  assert.equal(parsed.model.single.models.mid, "gpt-4.1");
  assert.equal(parsed.model.auto.routes[0]?.match.includes("grep"), true);
  assert.equal(parsed.team[0]?.name, "Dream Architect");
});

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
}
