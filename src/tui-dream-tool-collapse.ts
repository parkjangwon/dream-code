export type DreamToolBlockCollapser = {
  readonly chunk: (text: string) => string;
  readonly flush: () => string;
};

type CollapseState =
  | { readonly kind: "text"; readonly carry: string }
  | { readonly kind: "tool"; readonly content: string };

const toolFenceStart = "```dream-tool";
const fenceEnd = "```";

export function createDreamToolBlockCollapser(): DreamToolBlockCollapser {
  let state: CollapseState = { kind: "text", carry: "" };

  const consumeText = (text: string): string => {
    const combined = `${state.kind === "text" ? state.carry : ""}${text}`;
    const startIndex = combined.indexOf(toolFenceStart);
    if (startIndex === -1) {
      const pendingLength = pendingToolFencePrefixLength(combined);
      const emitLength = combined.length - pendingLength;
      state = { kind: "text", carry: combined.slice(emitLength) };
      return combined.slice(0, emitLength);
    }

    const before = combined.slice(0, startIndex);
    const afterStart = combined.slice(startIndex + toolFenceStart.length);
    const contentStartIndex = lineBreakEndIndex(afterStart);
    if (contentStartIndex === undefined) {
      state = { kind: "tool", content: "" };
      return before;
    }

    state = { kind: "tool", content: "" };
    return `${before}${consumeTool(afterStart.slice(contentStartIndex))}`;
  };

  const consumeTool = (text: string): string => {
    const combined = `${state.kind === "tool" ? state.content : ""}${text}`;
    const endIndex = combined.indexOf(fenceEnd);
    if (endIndex === -1) {
      state = { kind: "tool", content: combined };
      return "";
    }

    const toolContent = combined.slice(0, endIndex);
    const afterEnd = combined.slice(endIndex + fenceEnd.length);
    const contentEndIndex = lineBreakEndIndex(afterEnd) ?? afterEnd.length;
    state = { kind: "text", carry: "" };
    return `${formatCollapsedToolBlock(toolContent)}${consumeText(afterEnd.slice(contentEndIndex))}`;
  };

  return {
    chunk: (text) => state.kind === "tool" ? consumeTool(text) : consumeText(text),
    flush: () => {
      if (state.kind === "text") {
        const carry = state.carry;
        state = { kind: "text", carry: "" };
        return carry;
      }

      const toolContent = state.content;
      state = { kind: "text", carry: "" };
      return formatCollapsedToolBlock(toolContent);
    },
  };
}

function lineBreakEndIndex(text: string): number | undefined {
  const lineBreakIndex = text.indexOf("\n");
  if (lineBreakIndex === -1) {
    return undefined;
  }
  return lineBreakIndex + 1;
}

function pendingToolFencePrefixLength(text: string): number {
  for (let length = toolFenceStart.length - 1; length > 0; length -= 1) {
    const prefix = toolFenceStart.slice(0, length);
    if (text.endsWith(prefix) && prefixStartsLine(text, length)) {
      return length;
    }
  }
  return 0;
}

function prefixStartsLine(text: string, prefixLength: number): boolean {
  const startIndex = text.length - prefixLength;
  return startIndex === 0 || text[startIndex - 1] === "\n";
}

function formatCollapsedToolBlock(content: string): string {
  const toolCount = countToolRequests(content);
  const callLabel = toolCount === 1 ? "call" : "calls";
  return `◇ Tools queued · ${toolCount} ${callLabel}\n`;
}

function countToolRequests(content: string): number {
  const matches = content.match(/["']tool["']\s*:/gu);
  return Math.max(1, matches?.length ?? 0);
}
