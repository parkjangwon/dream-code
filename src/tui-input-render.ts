import { stdin as input, stdout as output } from "node:process";

import { ansi, paint } from "./ansi.js";
import type { DreamSkill } from "./skills.js";
import type { FileMentionTarget } from "./file-mention-targets.js";
import { withHiddenCursor } from "./terminal-frame.js";
import { terminalVisibleWidth } from "./terminal-width.js";
import { cockpitPromptRowOffsetFromBottom, renderCockpitFrame } from "./tui-cockpit.js";
import { writeCockpitFrame } from "./tui-cockpit-write.js";
import { clearRenderedInputViewSequence } from "./tui-input-frame.js";
import type { RenderedInputView } from "./tui-input-frame.js";
import { inputViewport } from "./tui-input-viewport.js";
import type { InputState } from "./tui-input-state.js";
import { renderPaletteLines } from "./tui-input-palette-render.js";
import { shortcutGuideLines } from "./tui-shortcuts.js";
import type { CursorRowQuery } from "./terminal-cursor-query.js";

export type { RenderedInputView } from "./tui-input-frame.js";
export {
  formatCommandPaletteLine,
  formatFilePaletteLine,
  formatPaletteHeading,
  renderPaletteDescription,
} from "./tui-input-palette-render.js";

export async function renderInputView(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  previousFrame: RenderedInputView | undefined = undefined,
  cursorRowQuery: CursorRowQuery | undefined = undefined,
): Promise<RenderedInputView> {
  const width = Math.max(64, output.columns ?? 80);
  const promptWidth = terminalVisibleWidth(prompt);
  const viewport = inputViewport(state.text, state.cursor, Math.max(0, width - promptWidth));
  const promptLine = `${paint(prompt, ansi.accent)}${renderInputText(viewport.text, secret, state.skills, state.fileMentions)}`;
  const frame = renderCockpitFrame({
    promptLine,
    promptCursorColumn: promptWidth + viewport.cursorColumn,
    width,
    auxiliaryLines: renderAuxiliaryLines(state, secret, width),
    footerLines: statusLines,
  });
  return writeCockpitFrame({ input, output }, frame, previousFrame, cursorRowQuery);
}

export async function renderInputViewLineCount(
  state: InputState,
  prompt: string,
  secret = false,
  statusLines: readonly string[] = [],
  previousFrame: RenderedInputView | undefined = undefined,
): Promise<number> {
  return (await renderInputView(state, prompt, secret, statusLines, previousFrame)).lineCount;
}

export function clearRenderedInputView(frame: RenderedInputView | undefined): void {
  if (frame === undefined) {
    return;
  }

  output.write(withHiddenCursor(clearRenderedInputViewSequence(frame)));
}

export function clearRenderedLines(count: number): void {
  if (count === 0) {
    return;
  }

  output.write(withHiddenCursor(clearRenderedLinesSequence(count)));
}

function clearRenderedLinesSequence(count: number): string {
  if (count === 0) {
    return "";
  }

  let sequence = "\r\u001B[1A\r";
  for (let index = 0; index < count; index += 1) {
    sequence = `${sequence}\u001B[2K`;
    if (index < count - 1) {
      sequence = `${sequence}\u001B[1B\r`;
    }
  }

  if (count > 1) {
    sequence = `${sequence}\u001B[${count - 1}A\r`;
  }
  return sequence;
}

function renderAuxiliaryLines(
  state: InputState,
  secret: boolean,
  width: number,
): readonly string[] {
  if (secret) {
    return [];
  }

  const paletteLines = renderPaletteLines(state, width);
  if (paletteLines.length > 0) {
    return paletteLines;
  }

  if (shouldShowInlineShortcutGuide(state.text)) {
    return shortcutGuideLines();
  }

  return [paint("? for shortcuts", ansi.guide)];
}

export function cursorUpToPromptLineCount(_lineCount: number, footerLineCount = 0): number {
  return cockpitPromptRowOffsetFromBottom(footerLineCount);
}

export function shouldShowInlineShortcutGuide(text: string): boolean {
  return text === "?";
}

export function displayInputText(text: string, secret: boolean): string {
  return secret ? "*".repeat(text.length) : text;
}

export function renderInputText(
  text: string,
  secret: boolean,
  skills: readonly DreamSkill[] = [],
  fileMentions: readonly FileMentionTarget[] = [],
): string {
  return secret ? displayInputText(text, true) : highlightFileMentions(text, fileMentions, skills);
}

function highlightFileMentions(
  text: string,
  fileMentions: readonly FileMentionTarget[],
  _skills: readonly DreamSkill[],
): string {
  const paths = new Set(fileMentions.map((target) => target.path.toLowerCase()));
  return text.replace(/(^|\s)(@[^\s]+)/gu, (_, prefix: string, mention: string) => {
    const path = mentionPath(mention);
    return path !== undefined && paths.has(path.toLowerCase())
      ? `${prefix}${paint(mention, ansi.blue)}`
      : `${prefix}${mention}`;
  });
}

function mentionPath(mention: string): string | undefined {
  const token = mention.slice(1).replace(/[),.;\]}]+$/u, "");
  const path = token.replace(/#\d+(?:-\d+)?$/u, "");
  return path.length === 0 ? undefined : path;
}
