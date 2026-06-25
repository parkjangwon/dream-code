import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
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

test("loginProvider exposes OpenAI API and OAuth choices in the picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const nextConfig = await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "",
      env: { OPENAI_API_KEY: "sk-openai" },
      questioner: {
        question: async () => "",
        select: async (options) => {
          const openAiApi = options.choices.find((choice) => choice.value === "openai");
          const openAiOauth = options.choices.find((choice) => choice.value === "openai:oauth");
          assert.equal(openAiApi?.description.includes("(api)"), true);
          assert.equal(openAiOauth?.description.includes("(oauth)"), true);
          assert.equal(openAiOauth?.keywords.includes("(oauth)"), true);
          assert.equal(openAiOauth?.keywords.includes("subscription"), true);
          return "openai";
        },
      },
    });

    assert.equal(nextConfig.model.single.provider, "openai");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("loginProvider connects OpenAI OAuth when selected from the picker", async () => {
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
      args: "",
      env: { CODEX_HOME: codexHome },
      questioner: {
        question: async () => "",
        select: async () => "openai:oauth",
      },
    });
    const credential = await readProviderCredential("openai", root);

    assert.equal(nextConfig.model.single.provider, "openai");
    assert.equal(credential?.authMode, "oauth");
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
    await rm(codexHome, { recursive: true, force: true });
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

test("loginProvider connects Ollama without prompting for an API key", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const prompts: string[] = [];
    const nextConfig = await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "ollama",
      env: {},
      questioner: {
        question: async (prompt) => {
          prompts.push(prompt);
          return "";
        },
        secret: async (prompt) => {
          prompts.push(prompt);
          return "should-not-be-used";
        },
      },
    });
    const credential = await readProviderCredential("ollama", root);

    assert.deepEqual(prompts, []);
    assert.equal(nextConfig.model.single.provider, "ollama");
    assert.deepEqual(credential, {
      authMode: "none",
      region: "local",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
  } finally {
    stdout.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});

test("loginProvider accepts a custom-openai base URL argument and discovers models", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const server = await startOpenAiCompatibleModelServer([
    "local-fast",
    "local-balanced",
    "local-pro",
  ]);
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const prompts: string[] = [];
    const nextConfig = await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: `custom-openai ${server.baseUrl}/v1`,
      env: { CUSTOM_OPENAI_API_KEY: "sk-custom" },
      questioner: {
        question: async (prompt) => {
          prompts.push(prompt);
          return "";
        },
      },
    });
    const credential = await readProviderCredential("custom-openai", root);

    assert.deepEqual(prompts, []);
    assert.equal(nextConfig.model.single.provider, "custom-openai");
    assert.deepEqual(nextConfig.model.single.models, {
      low: "local-fast",
      mid: "local-balanced",
      high: "local-pro",
    });
    assert.deepEqual(credential, {
      region: "custom",
      baseUrl: `${server.baseUrl}/v1`,
    });
    assert.deepEqual(server.requests, ["/v1/models"]);
  } finally {
    stdout.mock.restore();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("loginProvider prompts custom-openai for an OpenAI-compatible base URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "dream-login-"));
  const server = await startOpenAiCompatibleModelServer(["custom-balanced"]);
  const stdout = mock.method(process.stdout, "write", () => true);
  try {
    const prompts: string[] = [];
    await loginProvider({
      config: defaultConfig(),
      configRoot: root,
      args: "custom-openai",
      env: { CUSTOM_OPENAI_API_KEY: "sk-custom" },
      questioner: {
        question: async (prompt) => {
          prompts.push(prompt);
          return `${server.baseUrl}/v1`;
        },
      },
    });

    assert.deepEqual(prompts, ["Base URL (include /v1 if required): "]);
    assert.deepEqual(server.requests, ["/v1/models"]);
  } finally {
    stdout.mock.restore();
    await server.close();
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

type OpenAiCompatibleModelServer = {
  readonly baseUrl: string;
  readonly requests: readonly string[];
  readonly close: () => Promise<void>;
};

function startOpenAiCompatibleModelServer(models: readonly string[]): Promise<OpenAiCompatibleModelServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!isAddressInfo(address)) {
        reject(new Error("OpenAI-compatible model server did not expose a TCP port."));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error !== undefined) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        }),
      });
    });
  });
}

function isAddressInfo(value: string | AddressInfo | null): value is AddressInfo {
  return typeof value === "object" && value !== null && "port" in value;
}
