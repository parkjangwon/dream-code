import test from "node:test";
import assert from "node:assert/strict";

import {
  parseConfigToml,
  serializeMainConfigToml,
  serializeModelConfigToml,
} from "../src/config-toml.js";
import { defaultConfig, dreamConfigSchema } from "../src/config.js";

test("TOML serializers split main and model config sections", () => {
  const config = defaultConfig();
  const mainToml = serializeMainConfigToml(config);
  const modelToml = serializeModelConfigToml(config.model);

  assert.match(mainToml, /\[permissions\]/);
  assert.doesNotMatch(mainToml, /\[model\]/);
  assert.match(modelToml, /\[model\.single\.models\]/);
  assert.match(modelToml, /\[\[model\.auto\.routes\]\]/);
  assert.match(modelToml, /\[\[model\.auto\.categories\]\]/);
  assert.match(modelToml, /\[\[model\.auto\.agentRoutes\]\]/);
});

test("parseConfigToml reads serialized Dream config", () => {
  const config = defaultConfig();
  const main = parseConfigToml(serializeMainConfigToml(config));
  const model = parseConfigToml(serializeModelConfigToml(config.model));
  assertRecord(main);
  assertRecord(model);
  const parsed = dreamConfigSchema.parse({
    ...main,
    ...model,
    team: config.team,
  });

  assert.equal(parsed.version, 1);
  assert.equal(parsed.permissions.mode, "ask");
  assert.equal(parsed.model.single.models.mid, "gpt-4.1");
  assert.equal(parsed.model.auto.routes[0]?.match.includes("grep"), true);
  assert.equal(parsed.model.auto.categories?.[0]?.id, "quick");
  assert.equal(parsed.model.auto.agentRoutes?.[0]?.agent, "tech-lead");
  assert.equal(parsed.model.auto.preferConnectedProviders, true);
  assert.equal(parsed.team[0]?.name, "Dream Architect");
});

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
}
