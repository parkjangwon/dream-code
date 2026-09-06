import test from "node:test";
import assert from "node:assert/strict";

import {
  cursorPositionReportAt,
  cursorPositionReportRequestSequence,
  findCursorPositionReport,
  isCursorPositionReportFragment,
  stripCursorPositionReports,
} from "../src/cursor-position-report.js";

const esc = "";

test("cursorPositionReportRequestSequence asks the terminal to report cursor position", () => {
  assert.equal(cursorPositionReportRequestSequence, `${esc}[6n`);
});

test("cursorPositionReportAt parses a report at the given index", () => {
  const report = cursorPositionReportAt(`${esc}[24;10R`, 0);
  assert.deepEqual(report, { row: 24, column: 10, endIndex: 8 });
});

test("cursorPositionReportAt returns undefined when the text at index is not a report", () => {
  assert.equal(cursorPositionReportAt("hello", 0), undefined);
  assert.equal(cursorPositionReportAt(`${esc}[24;10M`, 0), undefined);
});

test("findCursorPositionReport locates a report inside surrounding text", () => {
  const report = findCursorPositionReport(`garbage${esc}[3;1Rmore`);
  assert.deepEqual(report, { row: 3, column: 1, endIndex: 13 });
});

test("findCursorPositionReport returns undefined when no report is present", () => {
  assert.equal(findCursorPositionReport("just typed text"), undefined);
});

test("stripCursorPositionReports removes only the report, keeping surrounding text", () => {
  assert.equal(stripCursorPositionReports(`abc${esc}[24;10Rdef`), "abcdef");
  assert.equal(stripCursorPositionReports("no report here"), "no report here");
});

test("isCursorPositionReportFragment recognizes a lone escape and progressive CSI fragments", () => {
  assert.equal(isCursorPositionReportFragment(esc), true);
  assert.equal(isCursorPositionReportFragment(`${esc}[`), true);
  assert.equal(isCursorPositionReportFragment(`${esc}[24`), true);
  assert.equal(isCursorPositionReportFragment(`${esc}[24;`), true);
  assert.equal(isCursorPositionReportFragment(`${esc}[24;10R`), true);
  assert.equal(isCursorPositionReportFragment("[24;10R"), true);
});

test("isCursorPositionReportFragment rejects ordinary typed input", () => {
  assert.equal(isCursorPositionReportFragment("a"), false);
  assert.equal(isCursorPositionReportFragment("5"), false);
  assert.equal(isCursorPositionReportFragment(""), false);
  assert.equal(isCursorPositionReportFragment(`${esc}q`), false);
});
