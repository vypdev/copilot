/** Shared cancellation signal for terminal and browser setup presenters. */
export class SetupInteractionCancelledError extends Error {
  constructor() {
    super('Setup input was cancelled.');
    this.name = 'SetupInteractionCancelledError';
  }
}
