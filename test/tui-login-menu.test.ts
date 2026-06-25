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

test("loginChoices exposes Ollama as a keyless provider", () => {
  const choices = loginChoices({ ollama: { authMode: "none", baseUrl: "http://127.0.0.1:11434/v1" } }, {});
  const ollamaChoices = choices.filter((choice) => choice.definition.id === "ollama");

  assert.deepEqual(ollamaChoices.map(loginChoiceValue), ["ollama:none"]);
  assert.deepEqual(ollamaChoices.map(authLabel), ["(none)"]);
  assert.deepEqual(ollamaChoices.map((choice) => choice.source), ["saved"]);
});
