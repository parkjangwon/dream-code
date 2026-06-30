import assert from "node:assert/strict";
import test from "node:test";

import { initialRemoteRouteFromHash } from "../src/remote-web-initial-route.js";

test("initialRemoteRouteFromHash reads thread project links", () => {
  assert.deepEqual(initialRemoteRouteFromHash("#/thread/L1VzZXJzL3Bqdy9kZXYvcHJvamVjdC96emFu"), {
    kind: "threadProject",
    projectId: "L1VzZXJzL3Bqdy9kZXYvcHJvamVjdC96emFu",
  });
});

test("initialRemoteRouteFromHash ignores non-thread links", () => {
  assert.deepEqual(initialRemoteRouteFromHash("#/"), { kind: "none" });
  assert.deepEqual(initialRemoteRouteFromHash("#/projects/example"), { kind: "none" });
});
