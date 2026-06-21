import { buildBottomStatusLines } from "./tui-status-bar.js";

export type StatusCacheInput = Parameters<typeof buildBottomStatusLines>[0];
export type StatusLineBuilder = (input: StatusCacheInput) => Promise<readonly string[]>;
export type BottomStatusCache = {
  readonly current: () => readonly string[];
  readonly refresh: (input: StatusCacheInput) => void;
  readonly settle: () => Promise<void>;
};

export function createBottomStatusCache(
  builder: StatusLineBuilder = buildBottomStatusLines,
  initialLines: readonly string[] = [],
): BottomStatusCache {
  let current = initialLines;
  let pending: Promise<void> | undefined;
  return {
    current: () => current,
    refresh: (input) => {
      if (pending !== undefined) {
        return;
      }
      pending = builder(input)
        .then((lines) => {
          current = lines;
        })
        .catch((error: unknown) => {
          if (error instanceof Error) {
            return;
          }
          throw error;
        })
        .finally(() => {
          pending = undefined;
        });
    },
    settle: async () => pending,
  };
}
