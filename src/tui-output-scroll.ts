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
  return {
    observe: (text) => {
      for (const match of text.matchAll(sgrMouseReportPattern())) {
        const report = match[0];
        pending = `${pending}${report.replace(/^\u001B\[</u, "")}`.slice(-maxPendingSuppressChars);
      }
    },
    shouldSuppressKeypress: (value, key) => {
      if (key.sequence === "\u001B[<") {
        return pending.length > 0;
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

function sgrMouseReportPattern(): RegExp {
  return /\u001B\[<(\d+);\d+;\d+[mM]/gu;
}
