export class RemoteCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteCliError";
  }
}
