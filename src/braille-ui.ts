export type BrailleProgressStatus = "queued" | "running" | "done" | "failed" | "cancelled";

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function brailleSpinner(frame: number): string {
  return spinnerFrames[positiveModulo(frame, spinnerFrames.length)] ?? spinnerFrames[0];
}

export function brailleActivity(frame: number): string {
  return ".".repeat(positiveModulo(frame, 6)).padEnd(5, " ");
}

export function brailleProgressBar(status: BrailleProgressStatus, frame = 0): string {
  switch (status) {
    case "queued":
      return "⠄⠄⠄⠄⠄⠄⠄⠄";
    case "running":
      return rotateGlyphs("⣀⣄⣤⣶⣿⣶⣤⣄", frame);
    case "done":
      return "⣿⣿⣿⣿⣿⣿⣿⣿";
    case "failed":
      return "⣿⣿⣤⣀⠄⠄⠄⠄";
    case "cancelled":
      return "⣤⣤⣄⣄⠄⠄⠄⠄";
    default:
      return assertNever(status);
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function rotateGlyphs(text: string, frame: number): string {
  const glyphs = Array.from(text);
  const offset = positiveModulo(frame, glyphs.length);
  return [...glyphs.slice(offset), ...glyphs.slice(0, offset)].join("");
}

function assertNever(value: never): never {
  throw new Error(`Unexpected braille progress status: ${String(value)}`);
}
