const hideCursor = "\u001B[?25l";
const showCursor = "\u001B[?25h";

export function withHiddenCursor(frame: string): string {
  return `${hideCursor}${frame}${showCursor}`;
}
