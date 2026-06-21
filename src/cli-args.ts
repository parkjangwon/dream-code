export type CliCommand = "tui" | "cron" | "daemon" | "doctor" | "help" | "init" | "prompt" | "version" | "workday";

export type ParsedArgs = {
  readonly command: CliCommand;
  readonly oneShotYolo: boolean;
  readonly rest: readonly string[];
  readonly json: boolean;
  readonly quiet: boolean;
  readonly prompt?: string;
};

export function parseArgs(args: readonly string[]): ParsedArgs {
  let command: CliCommand = "tui";
  let oneShotYolo = false;
  let json = false;
  let quiet = false;
  const rest: string[] = [];

  for (const [index, arg] of args.entries()) {
    switch (arg) {
      case "--yolo":
        oneShotYolo = true;
        break;
      case "--json":
        json = true;
        break;
      case "--quiet":
        quiet = true;
        break;
      case "--prompt":
      case "-p": {
        const prompt = parsePromptArgs(args.slice(index + 1), { json, quiet });
        return { command: "prompt", oneShotYolo, rest, json: prompt.json, quiet: prompt.quiet, prompt: prompt.text };
      }
      case "doctor":
        command = "doctor";
        break;
      case "workday":
        command = "workday";
        rest.push(...args.slice(index + 1));
        return { command, oneShotYolo, rest, json, quiet };
      case "cron":
        command = "cron";
        rest.push(...args.slice(index + 1));
        return { command, oneShotYolo, rest, json, quiet };
      case "daemon":
        command = "daemon";
        rest.push(...args.slice(index + 1));
        return { command, oneShotYolo, rest, json, quiet };
      case "init":
        command = "init";
        break;
      case "--help":
      case "-h":
        command = "help";
        break;
      case "--version":
      case "-v":
        command = "version";
        break;
      default:
        command = "help";
        break;
    }
  }

  return { command, oneShotYolo, rest, json, quiet };
}

function parsePromptArgs(
  args: readonly string[],
  initial: { readonly json: boolean; readonly quiet: boolean },
): { readonly text: string; readonly json: boolean; readonly quiet: boolean } {
  let json = initial.json;
  let quiet = initial.quiet;
  const text: string[] = [];
  for (const arg of args) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--quiet") {
      quiet = true;
    } else {
      text.push(arg);
    }
  }
  return { text: text.join(" "), json, quiet };
}
