import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig } from "../src/config.js";
import { createBottomStatusCache, type StatusLineBuilder } from "../src/tui-status-cache.js";

test("status cache returns the previous lines while refresh is still running", async () => {
  const refresh = deferred<readonly string[]>();
  const builder: StatusLineBuilder = async () => refresh.promise;
  const cache = createBottomStatusCache(builder, ["old status"]);

  cache.refresh({
    config: defaultConfig(),
    configRoot: "/tmp/dream-status-cache",
    sessionId: "session-1",
    cwd: "/tmp",
    oneShotYolo: false,
  });

  assert.deepEqual(cache.current(), ["old status"]);

  refresh.resolve(["fresh status"]);
  await cache.settle();

  assert.deepEqual(cache.current(), ["fresh status"]);
});

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolveValue: (value: Value) => void = () => {};
  const promise = new Promise<Value>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}
