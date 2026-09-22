export class UniqueTriggerTokenError extends Error {
  constructor() {
    super("trigger token already exists");
    this.name = "UniqueTriggerTokenError";
  }
}
