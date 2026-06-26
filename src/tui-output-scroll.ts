import { isTermuxRuntime } from "./terminal-environment.js";

export type OutputScroller = {
  readonly scroll: (lines: number) => boolean;
};

type VerticalKey = {
  readonly name?: string | undefined;
  readonly ctrl?: boolean | undefined;
  readonly meta?: boolean | undefined;
};

const scrollStepLines = 3;

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
  for (const match of text.matchAll(/\u001B\[<(\d+);\d+;\d+[mM]/gu)) {
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
