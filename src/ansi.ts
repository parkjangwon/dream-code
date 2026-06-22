export const ansi = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  inverse: "\u001B[7m",
  dim: "\u001B[2m",
  accent: "\u001B[38;5;141m",
  blue: "\u001B[38;5;75m",
  green: "\u001B[38;5;114m",
  yellow: "\u001B[38;5;221m",
  red: "\u001B[38;5;203m",
  muted: "\u001B[38;5;68m",
  guide: "\u001B[38;5;240m",
} as const;

export function paint(text: string, code: string): string {
  return `${code}${text}${ansi.reset}`;
}

export function clearScreen(): string {
  return "\u001B[2J\u001B[H";
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, "").replace(/[\u0008\r]/gu, "");
}
