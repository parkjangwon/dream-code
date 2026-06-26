export function isTermuxRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["TERMUX_VERSION"] !== undefined || env["PREFIX"]?.includes("/com.termux/") === true;
}
