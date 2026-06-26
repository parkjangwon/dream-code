export class UpdateCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpdateCommandError";
  }
}
