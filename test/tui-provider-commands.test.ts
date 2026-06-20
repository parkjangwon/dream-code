import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { defaultConfig } from "../src/config.js";
import { codexAuthFilePath, codexOAuthBaseUrl } from "../src/codex-oauth.js";
import { readProviderCredential } from "../src/credentials.js";
import { ansi } from "../src/ansi.js";
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
          const opencodeGo = options.choices.find((choice) => choice.value === "opencode-go");
          assert.notEqual(opencodeGo, undefined);
          assert.equal(opencodeGo?.descriptionStyle, "raw");
          assert.equal(opencodeGo?.description.includes(`${ansi.blue}env${ansi.reset}`), true);
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

test("loginProvider connects OpenAI with Codex OAuth", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const codexHome = await mkdtemp(join(tmpdir(), "dream-codex-home-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    await mkdir(codexHome, { recursive: true });
    await writeFile(codexAuthFilePath({ CODEX_HOME: codexHome }), JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: fakeJwt(4_102_444_800),
        refresh_token: "refresh-token",
        account_id: "acct_test",
      },
    }));

    const nextConfig = await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "openai oauth",
      env: { CODEX_HOME: codexHome },
      questioner: {
        question: async () => "",
      },
    });
    const credential = await readProviderCredential("openai", root);

    assert.equal(nextConfig.model.single.provider, "openai");
    assert.deepEqual(credential, {
      authMode: "oauth",
      region: "chatgpt",
      baseUrl: codexOAuthBaseUrl,
      accountId: "acct_test",
    });
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
  }
});

function fakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}
