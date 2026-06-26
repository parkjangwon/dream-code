import { isTermuxRuntime } from "./terminal-environment.js";

export type OutputScroller = {
  readonly scroll: (lines: number) => boolean;
};

export type TerminalMouseInputSuppressor = {
  readonly observe: (text: string) => void;
  readonly shouldSuppressKeypress: (value: string | undefined, key: KeypressFragment) => boolean;
};

type VerticalKey = {
  readonly name?: string | undefined;
  readonly ctrl?: boolean | undefined;
  readonly meta?: boolean | undefined;
};

type KeypressFragment = {
  readonly sequence?: string | undefined;
};

const scrollStepLines = 3;
const maxPendingSuppressChars = 512;
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
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isTermuxRuntime(env) || key.ctrl === true || key.meta === true) {
    return false;
  }
  if (key.name === "up") {
    return scrollActiveOutput(scrollStepLines);
  }
  if (key.name === "down") {
    return scrollActiveOutput(-scrollStepLines);
  }
  return false;
}

export function scrollDeltaFromTerminalInput(text: string): number | undefined {
  let delta = 0;
  for (const match of text.matchAll(sgrMouseReportPattern())) {
    const codeText = match[1];
    if (codeText === undefined) {
      continue;
    }
    const code = Number.parseInt(codeText, 10);
    if (code === 64) {
      delta += scrollStepLines;
    } else if (code === 65) {
      delta -= scrollStepLines;
    }
  }
  return delta === 0 ? undefined : delta;
}

export function createTerminalMouseInputSuppressor(): TerminalMouseInputSuppressor {
  let pending = "";
  let collectingMouseReport = false;
  let prefixCarry = "";
  const appendPending = (text: string): void => {
    pending = `${pending}${text}`.slice(-maxPendingSuppressChars);
  };
  return {
    observe: (text) => {
      const observed = `${prefixCarry}${text}`;
      prefixCarry = "";
      let index = 0;
      while (index < observed.length) {
        if (!collectingMouseReport) {
          const prefixIndex = observed.indexOf(sgrMouseReportPrefix, index);
          if (prefixIndex === -1) {
            prefixCarry = trailingSgrMouseReportPrefix(observed);
            return;
          }
          collectingMouseReport = true;
          index = prefixIndex + sgrMouseReportPrefix.length;
        }

        const tail = readSgrMouseReportTail(observed, index);
        appendPending(tail.text);
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
      if (key.sequence === sgrMouseReportPrefix) {
        return collectingMouseReport || pending.length > 0;
      }
      const fragment = value ?? key.sequence ?? "";
      if (fragment.length === 0 || !pending.startsWith(fragment)) {
        return false;
      }
      pending = pending.slice(fragment.length);
      return true;
    },
  };
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

function readSgrMouseReportTail(text: string, startIndex: number): {
  readonly text: string;
  readonly nextIndex: number;
  readonly completed: boolean;
} {
  let nextIndex = startIndex;
  while (nextIndex < text.length) {
    const char = text[nextIndex];
    if (char === undefined || !/[0-9;mM]/u.test(char)) {
      break;
    }
    nextIndex += 1;
    if (char === "m" || char === "M") {
      return { text: text.slice(startIndex, nextIndex), nextIndex, completed: true };
    }
  }
  return { text: text.slice(startIndex, nextIndex), nextIndex, completed: false };
}

function sgrMouseReportPattern(): RegExp {
  return /\u001B\[<(\d+);\d+;\d+[mM]/gu;
}
