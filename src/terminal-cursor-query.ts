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
const bottomRightProbeSequence = "[9999;9999H";
// Node's keypress decoder can lag the raw 'data' event that resolves a query by a
// tick or more, and on some devices the reply itself arrives split across several
// keypress events (one per byte). Keep suppressing for a short grace window after
// the query settles, and once a reply-shaped fragment starts a match, keep
// consuming fragments unconditionally until the terminating "R" — matching by
// shape alone breaks the moment the sequence is split mid-stream.
const suppressionGraceMs = 75;

export async function queryTerminalRows(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  cursorRowQuery: CursorRowQuery = createCursorRowQuery(),
  timeoutMs?: number,
): Promise<number | undefined> {
  output.write(bottomRightProbeSequence);
  return cursorRowQuery.queryRow(input, output, timeoutMs);
}

export function createCursorRowQuery(): CursorRowQuery {
  let pending = false;
  let collecting = false;
  let graceTimer: NodeJS.Timeout | undefined;

  const clearGrace = (): void => {
    if (graceTimer !== undefined) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }
  };

  return {
    queryRow: (input, output, timeoutMs = defaultTimeoutMs) => {
      return new Promise((resolve) => {
        let buffer = "";
        let settled = false;
        clearGrace();
        pending = true;
        collecting = false;

        const finish = (row: number | undefined): void => {
          if (settled) {
            return;
          }
          settled = true;
          input.off("data", onData);
          clearTimeout(timer);
          clearGrace();
          graceTimer = setTimeout(() => {
            pending = false;
            collecting = false;
            graceTimer = undefined;
          }, suppressionGraceMs);
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
      if (fragment.length === 0) {
        return false;
      }
      if (!collecting) {
        if (!isCursorPositionReportFragment(fragment)) {
          return false;
        }
        collecting = true;
      }
      if (fragment.includes("R")) {
        collecting = false;
      }
      return true;
    },
  };
}
