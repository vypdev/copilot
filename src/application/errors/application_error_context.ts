import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { isApplicationErrorCorrelationId } from '../../data/model/application_error';

const applicationErrorCorrelation = new AsyncLocalStorage<string>();

export function getApplicationErrorCorrelationId(): string | undefined {
    return applicationErrorCorrelation.getStore();
}

export function createApplicationErrorCorrelationId(): string {
    return randomUUID();
}

export function runWithApplicationErrorCorrelation<T>(
    correlationId: string,
    operation: () => T,
): T {
    if (!isApplicationErrorCorrelationId(correlationId)) {
        throw new TypeError('Application error correlation ID must be a lowercase UUID v4.');
    }
    return applicationErrorCorrelation.run(correlationId, operation);
}

/** Starts a boundary correlation only when the caller is not already nested in one. */
export function runAtApplicationErrorBoundary<T>(operation: () => T): T {
    return getApplicationErrorCorrelationId() === undefined
        ? runWithApplicationErrorCorrelation(createApplicationErrorCorrelationId(), operation)
        : operation();
}
