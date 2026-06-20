import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { defaultConfig } from "../src/config.js";
import { readProviderCredential } from "../src/credentials.js";
import { loginProvider } from "../src/tui-provider-commands.js";

test("loginProvider prompts for a provider when no argument is supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const prompts: string[] = [];
    const nextConfig = await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "",
      env: { DEEPSEEK_API_KEY: "sk-test" },
      questioner: {
        question: async (prompt) => {
          prompts.push(prompt);
          return "deepseek";
        },
      },
    });

    assert.equal(nextConfig.model.single.provider, "deepseek");
    assert.deepEqual(prompts, ["Provider: "]);
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("loginProvider can select a provider through the picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "",
      env: { OPENCODE_GO_API_KEY: "sk-test" },
      questioner: {
        question: async () => "",
        select: async (options) => {
          assert.equal(options.title, "Login");
          assert.equal(options.choices.some((choice) => choice.value === "opencode-go"), true);
          return "opencode-go";
        },
      },
    });

    assert.equal(nextConfig.model.single.provider, "opencode-go");
    assert.equal(nextConfig.model.single.models.mid, "kimi-k2.7-code");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("loginProvider prompts for region and stores a secret API key", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const prompts: string[] = [];
    await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "",
      env: {},
      questioner: {
        question: async (prompt) => {
          prompts.push(prompt);
          return prompts.length === 1 ? "kimi" : "cn";
        },
        secret: async (prompt) => {
          prompts.push(prompt);
          return "sk-kimi";
        },
      },
    });
    const credential = await readProviderCredential("kimi", root);

    assert.deepEqual(prompts, ["Provider: ", "Region [global/cn/coding]: ", "API key: "]);
    assert.equal(credential?.apiKey, "sk-kimi");
    assert.equal(credential?.region, "cn");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
