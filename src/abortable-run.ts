export function runWithAbort<T>(task: Promise<T>, signal: AbortSignal, cancelledValue: T): Promise<T> {
  if (signal.aborted) {
    return Promise.resolve(cancelledValue);
  }
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      resolve(cancelledValue);
    };
    signal.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}
