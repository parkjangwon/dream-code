export async function runWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>,
): Promise<readonly U[]> {
  if (items.length === 0) {
    return [];
  }
  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  const results = new Map<number, U>();
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    const item = items[index];
    if (item === undefined) {
      return;
    }
    results.set(index, await worker(item, index));
    await runNext();
  };

  await Promise.all(Array.from({ length: limit }, runNext));
  return items.map((_item, index) => {
    const result = results.get(index);
    if (result === undefined) {
      throw new Error(`Missing scheduled result at index ${index}`);
    }
    return result;
  });
}
