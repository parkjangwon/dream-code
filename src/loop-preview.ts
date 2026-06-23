import type { LoopSpec } from "./loop-spec.js";

export function formatLoopPreview(spec: LoopSpec): string {
  return [
    `loop preview: ${spec.name}`,
    `goal: ${spec.goal}`,
    `budget: ${spec.maxTurns} agent turns + ${spec.maxTurns} evaluator runs`,
    `evaluator: ${formatEvaluatorCommand(spec)}`,
    `timeout: ${spec.evaluator.timeoutMs}ms`,
    "",
  ].join("\n");
}

export function formatEvaluatorCommand(spec: LoopSpec): string {
  return [spec.evaluator.command, ...spec.evaluator.args].join(" ");
}
