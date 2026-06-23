export function monitorNowOption(now: (() => number) | undefined): { readonly now?: () => number } {
  return now === undefined ? {} : { now };
}

export function monitorColumnsOption(columns: number | undefined): { readonly terminalColumns?: number } {
  return columns === undefined ? {} : { terminalColumns: columns };
}
