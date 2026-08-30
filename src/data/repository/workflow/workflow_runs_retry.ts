import type { WorkflowPollingDelayPort } from '../../../application/ports/workflow_run_ports';

export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
}

const TRANSIENT_NETWORK_ERRORS = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH']);

export async function withWorkflowRunsRetry<T>(
    operation: () => Promise<T>,
    delayPort: WorkflowPollingDelayPort,
    policy: WorkflowRunsRetryPolicy,
): Promise<T> {
    let delayMilliseconds = policy.initialDelayMilliseconds;
    for (let attempt = 1; attempt <= policy.maximumAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error: unknown) {
            if (!shouldRetry(error, attempt, policy.maximumAttempts)) throw error;
            await delayPort.wait(delayMilliseconds);
            delayMilliseconds = nextRetryDelay(delayMilliseconds, policy);
        }
    }
    throw new Error('Workflow runs request retry policy was exhausted.');
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
    const candidate = error as { status?: unknown; code?: unknown };
    if (typeof candidate.status === 'number') {
        return candidate.status === 408 || candidate.status === 429 || candidate.status >= 500;
    }
    return typeof candidate.code === 'string' && TRANSIENT_NETWORK_ERRORS.has(candidate.code);
}
