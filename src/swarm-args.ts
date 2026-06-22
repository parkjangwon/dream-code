import type { SwarmIntensity } from "./swarm-intensity.js";

export type SwarmArgs = {
  readonly goal: string;
  readonly intensity?: SwarmIntensity;
  readonly forceLanes?: number;
  readonly deprecatedSize?: number;
};

export function parseSwarmArgs(args: string): SwarmArgs {
  const tokens = args.trim().split(/\s+/u).filter((token) => token.length > 0);
  const goalTokens: string[] = [];
  let intensity: SwarmIntensity | undefined;
  let forceLanes: number | undefined;
  let deprecatedSize: number | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const parsedIntensity = parseIntensity(token);
    if (parsedIntensity !== undefined) {
      intensity = parsedIntensity;
      continue;
    }
    if (token === "--lanes" || token === "--size") {
      const count = parseLaneCount(tokens[index + 1]);
      if (count !== undefined) {
        forceLanes = count;
        if (token === "--size") {
          deprecatedSize = count;
        }
        index += 1;
      }
      continue;
    }
    if (token !== undefined) {
      goalTokens.push(token);
    }
  }

  return {
    goal: goalTokens.join(" "),
    ...(intensity === undefined ? {} : { intensity }),
    ...(forceLanes === undefined ? {} : { forceLanes }),
    ...(deprecatedSize === undefined ? {} : { deprecatedSize }),
  };
}

function parseIntensity(value: string | undefined): SwarmIntensity | undefined {
  switch (value) {
    case "--light":
      return "light";
    case "--standard":
      return "standard";
    case "--deep":
      return "deep";
    case "--max":
      return "max";
    case "--overdrive":
      return "overdrive";
    default:
      return undefined;
  }
}

function parseLaneCount(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : undefined;
}
