import { stdout as output } from "node:process";

export type TerminalSize = {
  readonly rows: number | undefined;
  readonly columns: number | undefined;
};

export type TerminalSizeReader = () => TerminalSize;

export function readStdoutTerminalSize(): TerminalSize {
  return {
    rows: output.rows,
    columns: output.columns,
  };
}

export function sameTerminalSize(left: TerminalSize, right: TerminalSize): boolean {
  return left.rows === right.rows && left.columns === right.columns;
}

export function createTerminalSizeChangeDetector(
  initialSize: TerminalSize,
): (nextSize: TerminalSize) => boolean {
  let currentSize = initialSize;
  return (nextSize) => {
    if (sameTerminalSize(currentSize, nextSize)) {
      return false;
    }
    currentSize = nextSize;
    return true;
  };
}

export function startTerminalSizeWatcher(options: {
  readonly readSize?: TerminalSizeReader;
  readonly onChange: () => void;
  readonly intervalMs?: number;
}): () => void {
  const readSize = options.readSize ?? readStdoutTerminalSize;
  const hasChanged = createTerminalSizeChangeDetector(readSize());
  const timer = setInterval(() => {
    if (hasChanged(readSize())) {
      options.onChange();
    }
  }, options.intervalMs ?? 250);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
