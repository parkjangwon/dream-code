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

// process.stdout.rows can be wrong (Termux is the known offender). Moving the
// cursor to an unreachably large row/column clamps it to the terminal's real
// bottom-right corner, so the row a CPR query reports back afterward is the
// terminal's true height rather than whatever Node guessed.
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
