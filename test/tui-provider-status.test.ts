import assert from "node:assert/strict";
import test from "node:test";

import { resolveProviderDefinition, type ProviderDefinition } from "../src/provider-registry.js";
import { providerConnectionSource } from "../src/tui-provider-status.js";

test("providerConnectionSource requires a base URL for custom-openai", () => {
  const definition = requireProviderDefinition("custom-openai");

  assert.equal(providerConnectionSource(definition, undefined, {
    CUSTOM_OPENAI_API_KEY: "sk-custom",
  }), "missing");
  assert.equal(providerConnectionSource(definition, undefined, {
    CUSTOM_OPENAI_API_KEY: "sk-custom",
    DREAM_CUSTOM_OPENAI_BASE_URL: "http://127.0.0.1:4000/v1",
  }), "env");
  assert.equal(providerConnectionSource(definition, {
    apiKey: "sk-custom",
  }, {}), "missing");
  assert.equal(providerConnectionSource(definition, {
    apiKey: "sk-custom",
    baseUrl: "http://127.0.0.1:4000/v1",
  }, {}), "saved");
});

function requireProviderDefinition(id: string): ProviderDefinition {
  const definition = resolveProviderDefinition(id);
  if (definition === undefined) {
    throw new Error(`Missing provider definition for ${id}`);
  }
  return definition;
}
