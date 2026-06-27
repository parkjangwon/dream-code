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

const scrollStepLines = 1;
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
  _key: VerticalKey,
  _env: NodeJS.ProcessEnv = process.env,
): boolean {
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
  let pendingMouseReportTailChars = 0;
  let collectingMouseReport = false;
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
    if (isSgrWheelMouseReportTailBurst(fragment)) {
      return true;
    }

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
}

function isSgrWheelMouseReportTailBurst(text: string): boolean {
  let index = 0;
  let consumed = false;
  while (index < text.length) {
    const nextIndex = sgrWheelMouseReportTailEndIndex(text, index);
    if (nextIndex === undefined) {
      return false;
    }
    index = nextIndex;
    consumed = true;
  }
  return consumed;
}

function sgrWheelMouseReportTailEndIndex(text: string, startIndex: number): number | undefined {
  const code = readDigits(text, startIndex);
  if (code === undefined || (code.text !== "64" && code.text !== "65")) {
    return undefined;
  }
  let index = code.nextIndex;
  if (text[index] !== ";") {
    return undefined;
  }
  const column = readDigits(text, index + 1);
  if (column === undefined) {
    return undefined;
  }
  index = column.nextIndex;
  if (text[index] !== ";") {
    return undefined;
  }
  const row = readDigits(text, index + 1);
  if (row === undefined) {
    return undefined;
  }
  index = row.nextIndex;
  const terminator = text[index];
  return terminator === "M" || terminator === "m" ? index + 1 : undefined;
}

function readDigits(text: string, startIndex: number): { readonly text: string; readonly nextIndex: number } | undefined {
  let index = startIndex;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code < 48 || code > 57) {
      break;
    }
    index += 1;
  }
  return index === startIndex ? undefined : { text: text.slice(startIndex, index), nextIndex: index };
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
