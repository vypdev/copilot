import type { WorkflowPollingDelayPort } from '../../../application/ports/workflow_run_ports';

export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
}

const TRANSIENT_NETWORK_ERRORS = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ECONNREFUSED',
    'UND_ERR_CONNECT_TIMEOUT',
]);

export async function withWorkflowRunsRetry<T>(
    operation: () => Promise<T>,
    delayPort: WorkflowPollingDelayPort,
    policy: WorkflowRunsRetryPolicy,
): Promise<T> {
    return executeWithRetry(operation, delayPort, policy, 1, policy.initialDelayMilliseconds);
}

async function executeWithRetry<T>(
    operation: () => Promise<T>,
    delayPort: WorkflowPollingDelayPort,
    policy: WorkflowRunsRetryPolicy,
    attempt: number,
    delayMilliseconds: number,
): Promise<T> {
    try {
        return await operation();
    } catch (error: unknown) {
        if (!shouldRetry(error, attempt, policy.maximumAttempts)) throw error;
        await delayPort.wait(delayMilliseconds);
        return executeWithRetry(
            operation,
            delayPort,
            policy,
            attempt + 1,
            nextRetryDelay(delayMilliseconds, policy),
        );
    }
}

function shouldRetry(error: unknown, attempt: number, maximumAttempts: number): boolean {
    return attempt < maximumAttempts && isTransientWorkflowRunsError(error);
}

function nextRetryDelay(currentDelay: number, policy: WorkflowRunsRetryPolicy): number {
    return Math.min(
        currentDelay * policy.backoffMultiplier,
        policy.maximumDelayMilliseconds,
    );
}

function isTransientWorkflowRunsError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        response?: { status?: unknown };
        message?: unknown;
    };
    const status = firstNumericValue(candidate.status, candidate.statusCode, candidate.response?.status);
    if (status !== undefined) {
        return status === 408 || status === 429 || status >= 500;
    }
    if (typeof candidate.code === 'string' && TRANSIENT_NETWORK_ERRORS.has(candidate.code)) return true;
    return typeof candidate.message === 'string'
        && /\b(server error|service unavailable|bad gateway|gateway timeout|temporarily unavailable)\b/i.test(candidate.message);
}

function firstNumericValue(...values: unknown[]): number | undefined {
    return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}
