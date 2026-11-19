/** Owns cancellation only for the lifetime of an admitted review invocation. */
export interface BugbotReviewCancellationPort {
    withSignal<T>(parent: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T>;
}
