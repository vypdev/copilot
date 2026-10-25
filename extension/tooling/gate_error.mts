/** Only reviewed gate diagnostics may be surfaced; arbitrary bundler exceptions are not echoed. */
export class FoundationGateError extends Error {}
export class PublishedCleanupError extends FoundationGateError {}
