export type BrailleProgressStatus = "queued" | "running" | "done" | "failed" | "cancelled";

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const activityFrames = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"] as const;

export function brailleSpinner(frame: number): string {
  return spinnerFrames[positiveModulo(frame, spinnerFrames.length)] ?? spinnerFrames[0];
}

export function brailleActivity(frame: number, width = 8): string {
  return Array.from({ length: Math.max(1, width) }, (_item, index) => {
    return activityFrames[positiveModulo(frame + index, activityFrames.length)] ?? "⠁";
  }).join("");
}

export function brailleProgressBar(status: BrailleProgressStatus): string {
  switch (status) {
    case "queued":
      return "⠄⠄⠄⠄⠄⠄⠄⠄";
    case "running":
      return "⣀⣄⣤⣶⣿⣶⣤⣄";
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

function assertNever(value: never): never {
  throw new Error(`Unexpected braille progress status: ${String(value)}`);
}
