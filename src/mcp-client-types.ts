export type McpToolCall = {
  readonly server: string;
  readonly name: string;
  readonly arguments?: Record<string, unknown> | undefined;
};

export type McpToolSummary = {
  readonly server: string;
  readonly name: string;
  readonly description: string;
};

export type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
};

export type ParsedMessage = {
  readonly message: unknown;
  readonly rest: Buffer<ArrayBufferLike>;
};

export type RpcResponse = {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: unknown;
};
