import assert from "node:assert/strict";
import { request } from "undici";

export async function pairToken(origin: string, code: string): Promise<string> {
  const pair = await request(`${origin}/api/pair`, {
    method: "POST",
    body: JSON.stringify({ code, deviceName: "android phone" }),
    headers: { "content-type": "application/json", "x-dream-remote-token-response": "body" },
  });
  assert.equal(pair.statusCode, 200);
  const paired = await pair.body.json() as { readonly token?: string };
  assert.equal(typeof paired.token, "string");
  return paired.token ?? "";
}

export async function submitCommand(
  origin: string,
  token: string,
  prompt: string,
): Promise<{ readonly command?: { readonly id?: string; readonly status?: string } }> {
  const submitted = await request(`${origin}/api/commands`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  assert.equal(submitted.statusCode, 202);
  return await submitted.body.json() as { readonly command?: { readonly id?: string; readonly status?: string } };
}

export async function waitForCommandStatus(origin: string, token: string, id: string, status: string): Promise<void> {
  const signal = AbortSignal.timeout(2_000);
  let events: Awaited<ReturnType<typeof request>> | undefined;
  try {
    events = await request(`${origin}/api/events`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    });
    assert.equal(events.statusCode, 200);
    let buffer = "";
    for await (const chunk of events.body) {
      buffer = `${buffer}${Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)}`;
      const parts = buffer.split(/\n\n/u);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (eventBlockHasCommandStatus(part, id, status)) {
          events.body.destroy();
          return;
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && signal.aborted) {
      assert.fail(`Timed out waiting for command ${id} to become ${status}`);
    }
    throw error;
  } finally {
    events?.body.destroy();
  }
  assert.fail(`Timed out waiting for command ${id} to become ${status}`);
}

export function cookieHeader(header: string | readonly string[] | undefined): string {
  return typeof header === "string" ? header : header?.join("; ") ?? "";
}

function eventBlockHasCommandStatus(block: string, id: string, status: string): boolean {
  const data = block
    .split(/\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (data.length === 0) {
    return false;
  }
  const parsed: unknown = JSON.parse(data);
  if (!isRecord(parsed)) {
    return false;
  }
  if (parsed["type"] === "snapshot" && Array.isArray(parsed["commands"])) {
    return parsed["commands"].some((command) => commandHasStatus(command, id, status));
  }
  return parsed["type"] === "command" && commandHasStatus(parsed["command"], id, status);
}

function commandHasStatus(value: unknown, id: string, status: string): boolean {
  return isRecord(value) && value["id"] === id && value["status"] === status;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
