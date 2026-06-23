import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

import { ansi } from "./ansi.js";
import { actionForKey, type InteractiveInputOptions } from "./tui-input.js";
import { anchoredInputViewLines, renderFixedPromptInputView } from "./tui-anchored-input-render.js";
import { agentViewLines, type AgentViewOptions, type AgentViewResult } from "./tui-agent-view.js";
import { createAgentViewState, hasActiveAgentRows, shouldFocusAgentViewFromInput, shouldReturnFromAgentView, updateAgentView, type AgentViewState } from "./tui-agent-view-state.js";
import { createInputState, reduceInputState, type InputState } from "./tui-input-state.js";
import { dispatchRunningCommand, type RunningOutputWriter, type RunningStatusWriter } from "./tui-interrupt-dispatch.js";
import { formatClearRunningInput, formatDeactivateRunningInputRegion, formatGuardedRunningOutput, formatPrepareRunningInputRedraw, interruptHint } from "./tui-interrupt-format.js";
import { parseRunningCommand, type RunningCommand } from "./tui-running-command.js";

export type EscInterruptState = {
  readonly armedAt?: number;
};

export type EscInterruptUpdate = {
  readonly state: EscInterruptState;
  readonly effect: "arm" | "abort";
};

export const escInterruptWindowMs = 1_500;

export type { RunningOutputWriter, RunningStatusWriter } from "./tui-interrupt-dispatch.js";
export { formatGuardedRunningOutput } from "./tui-interrupt-format.js";

type AgentViewResultHandler = (result: AgentViewResult, write: RunningOutputWriter, setStatusLines: RunningStatusWriter) => Promise<void> | void;
type RunningCommandHandler = (command: RunningCommand, write: RunningOutputWriter, setStatusLines: RunningStatusWriter) => Promise<void> | void;

export type EscInterruptOptions = {
  readonly input?: InteractiveInputOptions;
  readonly loadAgentView?: () => Promise<AgentViewOptions>;
  readonly onAgentViewResult?: AgentViewResultHandler;
  readonly onRunningCommand?: RunningCommandHandler;
};

export async function runWithEscInterrupt<T>(
  task: (signal: AbortSignal, write: RunningOutputWriter) => Promise<T>,
  options: EscInterruptOptions = {},
): Promise<T> {
  const controller = new AbortController();
  if (input.isTTY !== true || output.isTTY !== true) {
    return task(controller.signal, (text) => output.write(text));
  }

  let state: EscInterruptState = {};
  let inputState = createInputState(options.input?.history ?? [], options.input?.commands ?? [], options.input?.skills ?? [], {
    fileMentions: options.input?.fileMentions ?? [],
  });
  let agentViewOptions = options.input?.agentView;
  let agentViewState: AgentViewState | undefined = agentViewOptions !== undefined && hasActiveAgentRows(agentViewOptions)
    ? createAgentViewState(agentViewOptions)
    : undefined;
  let agentViewFocused = false;
  let renderedInputLines = 0;
  let statusLines = options.input?.statusLines ?? [];
  let pendingCommand = Promise.resolve();
  const previousRawMode = input.isRaw;
  const writeInternal = (text: string): void => {
    output.write(text);
  };
  const writeGuardedOutput = (text: string): void => {
    writeInternal(formatGuardedRunningOutput(text, inputState, renderedInputLines, output.rows));
    renderInput();
  };
  const setStatusLines = (lines: readonly string[]): void => {
    statusLines = lines;
    renderInputWithRegion();
  };
  const renderedStatusLines = (): readonly string[] => {
    return statusLines;
  };
  const renderedAboveLines = (): readonly string[] => {
    if (!agentViewFocused || agentViewState === undefined) {
      return [];
    }
    return ["", ...agentViewLines(agentViewState, Math.max(80, output.columns ?? 80), inlineAgentViewMaxLines())];
  };
  const renderInput = (): void => {
    renderInputWithRegion();
  };
  const renderInputWithRegion = (): void => {
    const previousLineCount = renderedInputLines;
    const nextLineCount = anchoredInputViewLines(
      inputState,
      options.input?.prompt ?? "> ",
      options.input?.secret === true,
      renderedStatusLines(),
      renderedAboveLines(),
    ).length;
    writeInternal(formatPrepareRunningInputRedraw(output.rows, previousLineCount, nextLineCount));
    renderedInputLines = nextLineCount;
    renderedInputLines = renderFixedPromptInputView(
      inputState,
      options.input?.prompt ?? "> ",
      options.input?.secret === true,
      renderedStatusLines(),
      renderedAboveLines(),
      0,
    );
  };
  const deactivateRegion = (): void => {
    writeInternal(formatDeactivateRunningInputRegion());
  };
  const onKeypress = (value: string | undefined, key: Key): void => {
    if (key.ctrl === true && key.name === "c") {
      writeGuardedOutput(interruptHint("interrupting agent run", ansi.red));
      controller.abort();
      return;
    }
    if (agentViewFocused && agentViewState !== undefined) {
      if (shouldReturnFromAgentView(agentViewState, key)) {
        agentViewFocused = false;
        agentViewState = undefined;
        renderInputWithRegion();
        return;
      }
      const agentUpdate = updateAgentView(agentViewState, value, key);
      agentViewState = agentUpdate.state;
      if (agentUpdate.result === undefined) {
        renderInputWithRegion();
        return;
      }
      if (agentUpdate.result.kind === "close") {
        agentViewFocused = false;
        agentViewState = undefined;
        renderInputWithRegion();
        return;
      }
      pendingCommand = pendingCommand
        .then(async () => {
          if (agentUpdate.result !== undefined) {
            await options.onAgentViewResult?.(agentUpdate.result, writeGuardedOutput, setStatusLines);
          }
        })
        .finally(() => {
          agentViewFocused = false;
          agentViewState = undefined;
          renderInputWithRegion();
        });
      return;
    }

    if (key.name === "escape") {
      const update = nextEscInterruptState(state, Date.now());
      state = update.state;
      if (update.effect === "arm") {
        writeGuardedOutput(interruptHint("esc again to interrupt", ansi.yellow));
        return;
      }
      writeGuardedOutput(interruptHint("interrupting agent run", ansi.red));
      controller.abort();
      return;
    }

    const action = actionForKey(value, key);
    if (action === undefined) {
      return;
    }
    if (action.kind === "down") {
      if (shouldFocusAgentViewFromInput(inputState, agentViewOptions) && agentViewOptions !== undefined) {
        agentViewState = createAgentViewState(agentViewOptions);
        agentViewFocused = true;
        renderInputWithRegion();
        return;
      }
      if (inputState.text.length === 0 && inputState.historyIndex === undefined && inputState.palette === undefined && options.loadAgentView !== undefined) {
        pendingCommand = pendingCommand.then(async () => {
          const loaded = await options.loadAgentView?.();
          if (loaded === undefined || !shouldFocusAgentViewFromInput(inputState, loaded)) {
            return;
          }
          agentViewOptions = loaded;
          agentViewState = createAgentViewState(loaded);
          agentViewFocused = true;
          renderInputWithRegion();
        });
        return;
      }
    }
    const update = reduceInputState(inputState, action);
    inputState = update.state;
    switch (update.effect.kind) {
      case "none":
        renderInputWithRegion();
        return;
      case "submit":
        {
          const submittedText = update.effect.text;
          inputState = createInputState(inputState.history, inputState.commands, inputState.skills, {
            fileMentions: inputState.fileMentions,
          });
          renderInputWithRegion();
          pendingCommand = pendingCommand
            .then(async () => dispatchRunningCommand(
              parseRunningCommand(submittedText),
              options.onRunningCommand,
              controller,
              writeGuardedOutput,
              setStatusLines,
            ))
            .catch((error: unknown) => {
              writeGuardedOutput(interruptHint(error instanceof Error ? error.message : "running command failed", ansi.red));
            })
            .finally(() => {
              renderInputWithRegion();
            });
          return;
        }
      case "redraw":
        options.input?.redrawHeader();
        renderedInputLines = 0;
        renderInputWithRegion();
        return;
      case "cancel":
        writeGuardedOutput(interruptHint("interrupting agent run", ansi.red));
        controller.abort();
        return;
      default:
        return assertNever(update.effect);
    }
  };
  const onResize = (): void => {
    renderInputWithRegion();
  };

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  input.on("keypress", onKeypress);
  output.on("resize", onResize);
  renderInputWithRegion();
  writeGuardedOutput(interruptHint("esc interrupt · type steering text · /status /agents /interrupt", ansi.guide));
  try {
    return await task(controller.signal, writeGuardedOutput);
  } finally {
    input.off("keypress", onKeypress);
    output.off("resize", onResize);
    await pendingCommand;
    writeInternal(formatClearRunningInput(output.rows, renderedInputLines));
    deactivateRegion();
    input.setRawMode(previousRawMode);
    input.pause();
  }
}

function inlineAgentViewMaxLines(): number {
  return Math.max(6, Math.min(10, Math.floor((output.rows ?? 24) / 2)));
}

export function nextEscInterruptState(
  state: EscInterruptState,
  now: number,
  windowMs = escInterruptWindowMs,
): EscInterruptUpdate {
  if (state.armedAt !== undefined && now - state.armedAt <= windowMs) {
    return { state: {}, effect: "abort" };
  }
  return { state: { armedAt: now }, effect: "arm" };
}

function assertNever(value: never): never {
  throw new Error(`Unexpected running input effect: ${JSON.stringify(value)}`);
}
