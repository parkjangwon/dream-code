import { stdin as input } from "node:process";
import { emitKeypressEvents, type Key } from "node:readline";

export type SwarmMonitorKeyActions = {
  readonly moveSelection: (direction: number) => void;
  readonly openDetail: () => void;
  readonly closeDetail: () => void;
};

export type SwarmMonitorKeyController = {
  readonly start: () => void;
  readonly stop: () => void;
};

export function createSwarmMonitorKeyController(
  interactive: boolean,
  actions: SwarmMonitorKeyActions,
): SwarmMonitorKeyController {
  let keyHandler: ((chunk: string, key: Key) => void) | undefined;
  let previousRawMode = false;
  let inputWasPaused = true;

  return {
    start: () => {
      if (!interactive || input.isTTY !== true || keyHandler !== undefined) {
        return;
      }
      emitKeypressEvents(input);
      previousRawMode = input.isRaw;
      inputWasPaused = input.isPaused();
      input.setRawMode(true);
      input.resume();
      keyHandler = (_chunk, key) => {
        handleKey(key, actions);
      };
      input.on("keypress", keyHandler);
    },
    stop: () => {
      if (keyHandler === undefined) {
        return;
      }
      input.off("keypress", keyHandler);
      input.setRawMode(previousRawMode);
      if (inputWasPaused) {
        input.pause();
      }
      keyHandler = undefined;
    },
  };
}

function handleKey(key: Key, actions: SwarmMonitorKeyActions): void {
  switch (key.name) {
    case "up":
      actions.moveSelection(-1);
      return;
    case "down":
      actions.moveSelection(1);
      return;
    case "return":
      actions.openDetail();
      return;
    case "escape":
      actions.closeDetail();
      return;
    default:
      return;
  }
}
