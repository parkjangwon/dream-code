import {
  cursorPositionReportRequestSequence,
  findCursorPositionReport,
  isCursorPositionReportFragment,
} from "./cursor-position-report.js";

export type KeypressFragment = {
  readonly sequence?: string | undefined;
};

export type CursorRowQuery = {
  readonly queryRow: (
    input: NodeJS.ReadStream,
    output: NodeJS.WriteStream,
    timeoutMs?: number,
  ) => Promise<number | undefined>;
  readonly shouldSuppressKeypress: (value: string | undefined, key: KeypressFragment) => boolean;
};

const defaultTimeoutMs = 200;

export function createCursorRowQuery(): CursorRowQuery {
  let pending = false;

  return {
    queryRow: (input, output, timeoutMs = defaultTimeoutMs) => {
      return new Promise((resolve) => {
        let buffer = "";
        let settled = false;
        pending = true;

        const finish = (row: number | undefined): void => {
          if (settled) {
            return;
          }
          settled = true;
          pending = false;
          input.off("data", onData);
          clearTimeout(timer);
          resolve(row);
        };

        const onData = (chunk: Buffer | string): void => {
          buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
          const report = findCursorPositionReport(buffer);
          if (report !== undefined) {
            finish(report.row);
          }
        };

        const timer = setTimeout(() => finish(undefined), timeoutMs);
        input.on("data", onData);
        output.write(cursorPositionReportRequestSequence);
      });
    },
    shouldSuppressKeypress: (value, key) => {
      if (!pending) {
        return false;
      }
      const fragment = value ?? key.sequence ?? "";
      return isCursorPositionReportFragment(fragment);
    },
  };
}
