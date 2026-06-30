export type SgrMouseScrollState = {
  readonly lastDragRow: number | undefined;
};

export type SgrMouseScrollResult = {
  readonly delta: number;
  readonly state: SgrMouseScrollState;
};

const scrollStepLines = 1;

export function sgrWheelScrollDelta(text: string): number | undefined {
  let delta = 0;
  for (const report of sgrMouseReports(text)) {
    if (report.code === 64) {
      delta += scrollStepLines;
    } else if (report.code === 65) {
      delta -= scrollStepLines;
    }
  }
  return delta === 0 ? undefined : delta;
}

export function sgrMouseScrollDelta(text: string, state: SgrMouseScrollState): SgrMouseScrollResult {
  let delta = sgrWheelScrollDelta(text) ?? 0;
  let lastDragRow = state.lastDragRow;
  for (const report of sgrMouseReports(text)) {
    if (report.final === "m" || report.code === 3) {
      lastDragRow = undefined;
      continue;
    }
    if (isWheelCode(report.code)) {
      continue;
    }
    if (isDragMotionCode(report.code)) {
      if (lastDragRow !== undefined) {
        delta += report.row - lastDragRow;
      }
      lastDragRow = report.row;
      continue;
    }
    if (isPointerButtonCode(report.code)) {
      lastDragRow = report.row;
    }
  }
  return { delta, state: { lastDragRow } };
}

function isWheelCode(code: number): boolean {
  return code === 64 || code === 65;
}

function isDragMotionCode(code: number): boolean {
  return code >= 32 && code < 64;
}

function isPointerButtonCode(code: number): boolean {
  return code >= 0 && code < 32;
}

function sgrMouseReportPattern(): RegExp {
  return /\u001B\[<(\d+);(\d+);(\d+)([mM])/gu;
}

function sgrMouseReports(text: string): ReadonlyArray<{ readonly code: number; readonly row: number; readonly final: string }> {
  const reports: Array<{ readonly code: number; readonly row: number; readonly final: string }> = [];
  for (const match of text.matchAll(sgrMouseReportPattern())) {
    const codeText = match[1];
    const rowText = match[3];
    const final = match[4];
    if (codeText === undefined || rowText === undefined || final === undefined) {
      continue;
    }
    reports.push({
      code: Number.parseInt(codeText, 10),
      row: Number.parseInt(rowText, 10),
      final,
    });
  }
  return reports;
}
