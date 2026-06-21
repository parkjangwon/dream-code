import type { AgentDefinition } from "./agent-library.js";
import type { AgentRunKind } from "./agent-run-record.js";
import type { ActorRole } from "./actor-record.js";

export function actorRoleForRun(runKind: AgentRunKind, agent: AgentDefinition | undefined): ActorRole {
  switch (runKind) {
    case "agent":
      return agent === undefined ? "main" : "subagent";
    case "swarm-lane":
      return "subagent";
    case "swarm-synthesis":
      return "system";
    default:
      return assertNever(runKind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected agent run kind: ${String(value)}`);
}
