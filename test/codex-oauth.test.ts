import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  codexAuthFilePath,
  codexOAuthBaseUrl,
  readCodexOAuthCredential,
} from "../src/codex-oauth.js";

test("readCodexOAuthCredential reads a Codex ChatGPT login token", async () => {
  const home = await mkdtemp(join(tmpdir(), "dream-codex-oauth-"));
  try {
    await mkdir(home, { recursive: true });
    await writeFile(codexAuthFilePath({ CODEX_HOME: home }), JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: fakeJwt(4_102_444_800),
        refresh_token: "refresh-token",
        account_id: "acct_test",
      },
      last_refresh: "2026-06-20T00:00:00.000Z",
    }));

    const credential = await readCodexOAuthCredential({ CODEX_HOME: home });

    assert.deepEqual(credential, {
      accessToken: fakeJwt(4_102_444_800),
      accountId: "acct_test",
      baseUrl: codexOAuthBaseUrl,
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

function fakeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.signature`;
}
