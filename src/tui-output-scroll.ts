import {
  readSgrMouseReportTail,
  sgrMouseReportPartialTailEndIndex,
  sgrMouseReportTailEndIndex,
} from "./sgr-mouse-report.js";
import { sgrMouseScrollDelta, sgrWheelScrollDelta, type SgrMouseScrollState } from "./sgr-mouse-scroll.js";

export type OutputScroller = {
  readonly scroll: (lines: number) => boolean;
};

export type TerminalMouseInputSuppressor = {
  readonly observe: (text: string) => void;
  readonly shouldSuppressKeypress: (value: string | undefined, key: KeypressFragment) => boolean;
};

export type TerminalOutputScrollInput = {
  readonly handle: (text: string) => boolean;
};

type VerticalKey = {
  readonly name?: string | undefined;
  readonly ctrl?: boolean | undefined;
  readonly meta?: boolean | undefined;
};

type KeypressFragment = {
  readonly sequence?: string | undefined;
};

const keyboardScrollStepLines = 8;
const sgrMouseReportPrefix = "\u001B[<";
const maxSgrMouseReportPrefixCarryChars = sgrMouseReportPrefix.length - 1;

let activeOutputScroller: OutputScroller | undefined;

export function setActiveOutputScroller(scroller: OutputScroller): () => void {
  activeOutputScroller = scroller;
  return () => {
    if (activeOutputScroller === scroller) {
      activeOutputScroller = undefined;
    }
  };
}

export function scrollActiveOutput(lines: number): boolean {
  return activeOutputScroller?.scroll(lines) ?? false;
}

export function scrollOutputForTerminalInput(text: string): boolean {
  const delta = scrollDeltaFromTerminalInput(text);
  return delta === undefined ? false : scrollActiveOutput(delta);
}

export function scrollOutputForVerticalKey(
  key: VerticalKey,
  _env: NodeJS.ProcessEnv = process.env,
): boolean {
  switch (key.name) {
    case "pageup":
      return scrollActiveOutput(keyboardScrollStepLines);
    case "pagedown":
      return scrollActiveOutput(-keyboardScrollStepLines);
    default:
      return false;
  }
}

export function createTerminalOutputScrollInput(): TerminalOutputScrollInput {
  let state: SgrMouseScrollState = { lastDragRow: undefined };
  return {
    handle: (text) => {
      const result = sgrMouseScrollDelta(text, state);
      state = result.state;
      return result.delta === 0 ? false : scrollActiveOutput(result.delta);
    },
  };
}

export function scrollDeltaFromTerminalInput(text: string): number | undefined {
  return sgrWheelScrollDelta(text);
}

export function createTerminalMouseInputSuppressor(): TerminalMouseInputSuppressor {
  let pendingMouseReportTailChars = 0;
  let collectingMouseReport = false;
  let collectingUnprefixedMouseReport = false;
  let prefixCarry = "";
  return {
    observe: (text) => {
      const observed = `${prefixCarry}${text}`;
      prefixCarry = "";
      let index = 0;
      while (index < observed.length) {
        if (!collectingMouseReport) {
          const prefixIndex = observed.indexOf(sgrMouseReportPrefix, index);
          if (prefixIndex === -1) {
            if (observeUnprefixedMouseTailText(observed)) {
              return;
            }
            prefixCarry = trailingSgrMouseReportPrefix(observed);
            return;
          }
          collectingMouseReport = true;
          index = prefixIndex + sgrMouseReportPrefix.length;
        }

        const tail = readSgrMouseReportTail(observed, index);
        pendingMouseReportTailChars += tail.text.length;
        index = tail.nextIndex;
        if (tail.completed) {
          collectingMouseReport = false;
        } else if (tail.text.length === 0 && index < observed.length) {
          collectingMouseReport = false;
          index += 1;
        }
      }
    },
    shouldSuppressKeypress: (value, key) => {
      const fragment = value ?? key.sequence ?? "";
      return consumeMouseKeypressFragment(fragment);
    },
  };

  function consumeMouseKeypressFragment(fragment: string): boolean {
    if ((pendingMouseReportTailChars > 0 || collectingMouseReport) && consumePendingMouseKeypressFragment(fragment)) {
      return true;
    }
    if (consumeUnprefixedMouseTailFragment(fragment)) {
      return true;
    }

    return false;
  }

  function consumePendingMouseKeypressFragment(fragment: string): boolean {
    let index = 0;
    let consumed = false;
    while (index < fragment.length) {
      if (fragment.startsWith(sgrMouseReportPrefix, index)) {
        const tail = readSgrMouseReportTail(fragment, index + sgrMouseReportPrefix.length);
        if (tail.completed && tail.text.length <= pendingMouseReportTailChars) {
          pendingMouseReportTailChars -= tail.text.length;
          index = tail.nextIndex;
          consumed = true;
          continue;
        }
        if (
          index + sgrMouseReportPrefix.length === fragment.length &&
          (collectingMouseReport || pendingMouseReportTailChars > 0)
        ) {
          index += sgrMouseReportPrefix.length;
          consumed = true;
          continue;
        }
        return false;
      }

      const tailLength = sgrMouseReportTailFragmentLength(fragment, index);
      if (tailLength === 0 || tailLength > pendingMouseReportTailChars) {
        return false;
      }
      pendingMouseReportTailChars -= tailLength;
      index += tailLength;
      consumed = true;
    }
    return consumed;
  }

  function observeUnprefixedMouseTailText(text: string): boolean {
    let index = 0;
    let tailChars = 0;
    while (index < text.length) {
      const completeEndIndex = sgrMouseReportTailEndIndex(text, index);
      if (completeEndIndex === undefined) {
        return false;
      }
      tailChars += completeEndIndex - index;
      index = completeEndIndex;
    }
    if (tailChars === 0) {
      return false;
    }
    pendingMouseReportTailChars += tailChars;
    return true;
  }

  function consumeUnprefixedMouseTailFragment(fragment: string): boolean {
    let index = 0;
    let consumed = false;
    if (collectingUnprefixedMouseReport) {
      const terminator = fragment[index];
      if (terminator !== "M" && terminator !== "m") {
        collectingUnprefixedMouseReport = false;
        return false;
      }
      index += 1;
      consumed = true;
      collectingUnprefixedMouseReport = false;
    }

    while (index < fragment.length) {
      const completeEndIndex = sgrMouseReportTailEndIndex(fragment, index);
      if (completeEndIndex !== undefined) {
        index = completeEndIndex;
        consumed = true;
        continue;
      }

      const partialEndIndex = sgrMouseReportPartialTailEndIndex(fragment, index);
      if (partialEndIndex === fragment.length) {
        collectingUnprefixedMouseReport = true;
        return true;
      }
      return false;
    }
    return consumed;
  }
}

function sgrMouseReportTailFragmentLength(text: string, startIndex: number): number {
  let index = startIndex;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    const isDigit = code >= 48 && code <= 57;
    if (!isDigit && code !== 59 && code !== 77 && code !== 109) {
      break;
    }
    index += 1;
  }
  return index - startIndex;
}

function trailingSgrMouseReportPrefix(text: string): string {
  const maxLength = Math.min(maxSgrMouseReportPrefixCarryChars, text.length);
  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = text.slice(-length);
    if (sgrMouseReportPrefix.startsWith(suffix)) {
      return suffix;
    }
  }
  return "";
}
