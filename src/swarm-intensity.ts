export type SwarmIntensity = "light" | "standard" | "deep" | "max" | "overdrive";

const intensityBudgets = {
  light: 3,
  standard: 5,
  deep: 8,
  max: 12,
  overdrive: 10,
} as const satisfies Record<SwarmIntensity, number>;

export function adaptiveLaneLimit(intensity: SwarmIntensity): number {
  return intensityBudgets[intensity];
}
