import type { BugbotReviewCancellationPort } from '../../application/ports/bugbot_review_cancellation_ports';

/** Constructing this adapter installs nothing; only an actual review observes signals. */
export class NativeBugbotReviewCancellationAdapter implements BugbotReviewCancellationPort {
    constructor(private readonly signals?: Pick<NodeJS.EventEmitter, 'once' | 'removeListener'>) {}

    async withSignal<T>(parent: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
        if (parent?.aborted) return run(parent);
        const controller = new AbortController();
        const signals = this.signals ?? process;
        const cancel = () => controller.abort();
        const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
        try {
            signals.once('SIGINT', cancel);
            signals.once('SIGTERM', cancel);
            return await run(signal);
        } finally {
            // Dispose this invocation's remaining work if an upstream phase
            // returned before a sibling request settled; never abort the caller.
            controller.abort();
            signals.removeListener('SIGINT', cancel);
            signals.removeListener('SIGTERM', cancel);
        }
    }
}
