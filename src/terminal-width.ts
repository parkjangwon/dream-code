const ansiPattern = /\u001B\[[0-9;]*m/gu;

export function terminalVisibleWidth(text: string): number {
  let width = 0;
  const plainText = text.replace(ansiPattern, "");
  for (const char of plainText) {
    width += characterWidth(char);
  }
  return width;
}

function characterWidth(char: string): number {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) {
    return 0;
  }
  if (isZeroWidth(codePoint)) {
    return 0;
  }
  return isWide(codePoint) ? 2 : 1;
}

function isZeroWidth(codePoint: number): boolean {
  return (
    codePoint === 0 ||
    codePoint === 0x200d ||
    between(codePoint, 0x0300, 0x036f) ||
    between(codePoint, 0xfe00, 0xfe0f)
  );
}

function isWide(codePoint: number): boolean {
  return (
    between(codePoint, 0x1100, 0x115f) ||
    between(codePoint, 0x2329, 0x232a) ||
    between(codePoint, 0x2e80, 0xa4cf) ||
    between(codePoint, 0xac00, 0xd7a3) ||
    between(codePoint, 0xf900, 0xfaff) ||
    between(codePoint, 0xfe10, 0xfe19) ||
    between(codePoint, 0xfe30, 0xfe6f) ||
    between(codePoint, 0xff00, 0xff60) ||
    between(codePoint, 0xffe0, 0xffe6) ||
    between(codePoint, 0x1f300, 0x1faff)
  );
}

function between(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
