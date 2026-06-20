import assert from "node:assert/strict";
import test from "node:test";

import { ansi } from "../src/ansi.js";
import { authLabel, formatLoginSource, loginChoices, loginChoiceValue } from "../src/tui-login-menu.js";

test("formatLoginSource colors provider connection states", () => {
  assert.equal(formatLoginSource("env"), `${ansi.bold}${ansi.blue}env${ansi.reset}`);
  assert.equal(formatLoginSource("saved"), `${ansi.bold}${ansi.green}saved${ansi.reset}`);
  assert.equal(formatLoginSource("missing"), `${ansi.bold}${ansi.yellow}not set${ansi.reset}`);
});

test("loginChoices separates OpenAI API and OAuth login paths", () => {
  const choices = loginChoices({ openai: { apiKey: "sk-test" } }, {});
  const openAiChoices = choices.filter((choice) => choice.definition.id === "openai");

  assert.deepEqual(openAiChoices.map(loginChoiceValue), ["openai", "openai:oauth"]);
  assert.deepEqual(openAiChoices.map(authLabel), ["(api)", "(oauth)"]);
});

test("loginChoices keeps OpenAI API and OAuth saved states independent", () => {
  const choices = loginChoices({ openai: { authMode: "oauth" } }, {});
  const openAiChoices = choices.filter((choice) => choice.definition.id === "openai");

  assert.deepEqual(openAiChoices.map((choice) => choice.source), ["missing", "saved"]);
});
