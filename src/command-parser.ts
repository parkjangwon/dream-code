export type ParsedCommand = {
  readonly name: string;
  readonly rest: string;
};

export function splitCommand(text: string): ParsedCommand | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) {
    return { name: trimmed, rest: "" };
  }

  return {
    name: trimmed.slice(0, firstSpace),
    rest: trimmed.slice(firstSpace).trimStart(),
  };
}
