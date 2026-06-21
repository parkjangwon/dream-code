import assert from "node:assert/strict";
import test from "node:test";

import { runWithConcurrency } from "../src/swarm-scheduler.js";

test("runWithConcurrency caps active jobs while preserving output order", async () => {
  const release = deferred<void>();
  let active = 0;
  let maxActive = 0;
  let started = 0;

  const promise = runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
    active += 1;
    started += 1;
    maxActive = Math.max(maxActive, active);
    if (started === 2) {
      release.resolve();
    }
    await release.promise;
    active -= 1;
    return item * 2;
  });

  await release.promise;
  const results = await promise;

  assert.equal(maxActive, 2);
  assert.deepEqual(results, [2, 4, 6, 8]);
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}
