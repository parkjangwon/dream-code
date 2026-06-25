import { stripAnsi } from "./ansi.js";
import type { RemoteCommandActivityInput } from "./remote-command.js";

export function activityFromAgentProgress(text: string): RemoteCommandActivityInput | undefined {
  const clean = stripAnsi(text).trim();
  const toolText = toolProgressText(clean);
  return toolText === undefined ? undefined : activityFromToolText(toolText);
}

function toolProgressText(text: string): string | undefined {
  return text.match(/(?:^|\n)\S+\s+Tool\s+(.+?)(?:\n|$)/u)?.[1]
    ?? text.match(/^Tool\s+(.+)$/u)?.[1];
}

function activityFromToolText(toolText: string): RemoteCommandActivityInput {
  const compact = toolText.replace(/\s+/gu, " ").trim();
  const [toolName, ...rest] = compact.split(" ");
  const target = rest.join(" ").trim();
  switch (toolName) {
    case "cat":
    case "read":
      return labeled("Read", target, "Inspecting project context");
    case "edit":
    case "patch":
    case "write":
      return labeled("Changed", target, "Updating workspace files");
    case "find":
    case "glob":
    case "grep":
    case "rg":
    case "search":
      return labeled("Searched", target, "Finding relevant code paths");
    case "list":
    case "ls":
      return labeled("Listed", target, "Inspecting workspace entries");
    case "run":
    case "shell":
      return labeled("Ran", shortCommand(target), commandDetail(target));
    default:
      return fallbackActivity(compact);
  }
}

function labeled(action: string, target: string, detail: string): RemoteCommandActivityInput {
  return { label: target.length === 0 ? action : `${action} ${target}`, detail };
}

function commandDetail(command: string): string {
  const normalized = command.toLowerCase();
  if (/\b(test|node --test)\b/u.test(normalized)) {
    return "Running verification checks";
  }
  if (/\b(build|tsc|typecheck|lint|check)\b/u.test(normalized)) {
    return "Building and validating the project";
  }
  if (/\bgit\b/u.test(normalized)) {
    return "Inspecting repository state";
  }
  return "Executing a local command";
}

function shortCommand(command: string): string {
  return command.length <= 72 ? command : `${command.slice(0, 69)}...`;
}

function fallbackActivity(toolText: string): RemoteCommandActivityInput {
  return { label: `Tool ${toolText}`, detail: "Dream Code executed a local tool" };
}
