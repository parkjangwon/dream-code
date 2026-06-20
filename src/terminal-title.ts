type TerminalOutput = {
  readonly isTTY?: boolean;
  readonly write: (text: string) => unknown;
};

export const dreamTerminalTitle = "Dream Code";

export function terminalTitleSequence(title: string): string {
  return `\u001B]0;${sanitizeTitle(title)}\u0007`;
}

export function setTerminalTitle(output: TerminalOutput, title: string): void {
  if (output.isTTY === true) {
    output.write(terminalTitleSequence(title));
  }
}

function sanitizeTitle(title: string): string {
  return title.replace(/[\u0007\u001B]/gu, "");
}
