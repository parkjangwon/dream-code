export function readSgrMouseReportTail(text: string, startIndex: number): {
  readonly text: string;
  readonly nextIndex: number;
  readonly completed: boolean;
} {
  let nextIndex = startIndex;
  while (nextIndex < text.length) {
    const char = text[nextIndex];
    if (char === undefined || !/[0-9;mM]/u.test(char)) {
      break;
    }
    nextIndex += 1;
    if (char === "m" || char === "M") {
      return { text: text.slice(startIndex, nextIndex), nextIndex, completed: true };
    }
  }
  return { text: text.slice(startIndex, nextIndex), nextIndex, completed: false };
}

export function sgrMouseReportTailEndIndex(text: string, startIndex: number): number | undefined {
  const code = readDigits(text, startIndex);
  if (code === undefined) {
    return undefined;
  }
  let index = code.nextIndex;
  if (text[index] !== ";") {
    return undefined;
  }
  const column = readDigits(text, index + 1);
  if (column === undefined) {
    return undefined;
  }
  index = column.nextIndex;
  if (text[index] !== ";") {
    return undefined;
  }
  const row = readDigits(text, index + 1);
  if (row === undefined) {
    return undefined;
  }
  index = row.nextIndex;
  const terminator = text[index];
  return terminator === "M" || terminator === "m" ? index + 1 : undefined;
}

export function sgrMouseReportPartialTailEndIndex(text: string, startIndex: number): number | undefined {
  const code = readDigits(text, startIndex);
  if (code === undefined) {
    return undefined;
  }
  let index = code.nextIndex;
  let separators = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === ";") {
      separators += 1;
    } else if (char === undefined || char < "0" || char > "9") {
      return undefined;
    }
    if (separators > 2) {
      return undefined;
    }
    index += 1;
  }
  return separators === 2 ? index : undefined;
}

export function stripSgrMouseReportTails(text: string): string {
  let index = 0;
  let stripped = "";
  while (index < text.length) {
    const tailEndIndex = sgrMouseReportTailEndIndex(text, index);
    if (tailEndIndex !== undefined) {
      index = tailEndIndex;
      continue;
    }
    stripped = `${stripped}${text[index] ?? ""}`;
    index += 1;
  }
  return stripped;
}

function readDigits(text: string, startIndex: number): { readonly text: string; readonly nextIndex: number } | undefined {
  let index = startIndex;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code < 48 || code > 57) {
      break;
    }
    index += 1;
  }
  return index === startIndex ? undefined : { text: text.slice(startIndex, index), nextIndex: index };
}
