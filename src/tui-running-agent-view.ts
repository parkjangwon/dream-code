import { ansi, paint } from "./ansi.js";
import type { AgentViewResult } from "./tui-agent-view.js";

export function runningAgentViewResultLines(result: AgentViewResult): readonly string[] {
  switch (result.kind) {
    case "open":
    case "peek":
      return [
        `${paint(result.row.name, ansi.bold)} ${paint(result.row.status.toLowerCase(), ansi.dim)} · ${paint(result.row.age, ansi.dim)}`,
        result.row.summary,
        "",
        paint("↑/Esc returns to main · Space replies from /agents · s stops from /agents", ansi.guide),
      ];
    case "reply":
      return result.row.actorId === undefined
        ? [paint(`cannot reply: ${result.row.name}`, ansi.yellow)]
        : [
          paint(`reply target: ${result.row.name}`, ansi.green),
          `Use /reply ${result.row.actorId} <message> while this run continues.`,
        ];
    case "stop":
      return [
        paint(`stop target: ${result.row.name}`, ansi.yellow),
        "Use /agents for the guarded stop action.",
      ];
    case "templates":
      return [
        paint("Agent Library", ansi.bold),
        "Use /agents after the current run to create or manage reusable agents.",
      ];
    case "close":
      return [];
    default:
      return assertNever(result);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected running agent view result: ${JSON.stringify(value)}`);
}
