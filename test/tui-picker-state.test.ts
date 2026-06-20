import test from "node:test";
import assert from "node:assert/strict";

import {
  createPickerState,
  pickerSelection,
  pickerVisibleChoices,
  reducePickerState,
  type PickerChoice,
} from "../src/tui-picker-state.js";

const choices = [
  choice("deepseek-v4-flash", "DeepSeek V4 Flash"),
  choice("kimi-k2.7-code", "Kimi K2.7 Code"),
  choice("kimi-k2.6", "Kimi K2.6"),
] as const;

test("picker filters by typed keyword and focuses the first match", () => {
  const initial = createPickerState(choices);
  const filtered = reducePickerState(initial, { kind: "insert", value: "kimi" });

  assert.deepEqual(pickerVisibleChoices(filtered).map((item) => item.value), [
    "kimi-k2.7-code",
    "kimi-k2.6",
  ]);
  assert.equal(pickerSelection(filtered)?.value, "kimi-k2.7-code");
});

test("picker arrow navigation moves focus within filtered choices", () => {
  const filtered = reducePickerState(createPickerState(choices), { kind: "insert", value: "kimi" });
  const moved = reducePickerState(filtered, { kind: "down" });
  const movedBack = reducePickerState(moved, { kind: "up" });

  assert.equal(pickerSelection(moved)?.value, "kimi-k2.6");
  assert.equal(pickerSelection(movedBack)?.value, "kimi-k2.7-code");
});

function choice(value: string, label: string): PickerChoice {
  return { value, label, description: "", keywords: [] };
}
