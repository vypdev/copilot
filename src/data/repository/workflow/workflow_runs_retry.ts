import type {
    WorkflowPollingDelayPort,
    WorkflowPollingObserverPort,
    WorkflowPollingRandomPort,
    WorkflowQueueClockPort,
} from '../../../application/ports/workflow_run_ports';
import {
    calculateJitteredWorkflowDelay,
    type WorkflowPollingPolicy,
} from '../../../application/policies/workflow_queue_policy';

export interface WorkflowRunsRetryPolicy {
    maximumAttempts: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
    jitterRatio?: number;
    rateLimitInitialDelayMilliseconds?: number;
    rateLimitMaximumDelayMilliseconds?: number;
}

export const WORKFLOW_RUNS_RETRY_POLICY: WorkflowRunsRetryPolicy = {
    maximumAttempts: 5,
    initialDelayMilliseconds: 1000,
    backoffMultiplier: 2,
    maximumDelayMilliseconds: 30000,
    jitterRatio: 0.2,
    rateLimitInitialDelayMilliseconds: 60000,
    rateLimitMaximumDelayMilliseconds: 300000,
};

export class WorkflowQueueDeadlineError extends Error {
    constructor() {
        super('Timeout waiting for previous runs to finish.');
        this.name = 'WorkflowQueueDeadlineError';
    }
}

export interface WorkflowRunsRetryDependencies {
    delayPort: WorkflowPollingDelayPort;
    clock: WorkflowQueueClockPort;
    random: WorkflowPollingRandomPort;
    observer?: Pick<WorkflowPollingObserverPort, 'providerRetry'>;
    policy: WorkflowRunsRetryPolicy;
    deadlineAtMilliseconds: number;
}

export function withWorkflowRunsRetry<T>(
    operation: () => Promise<T>,
    dependencies: WorkflowRunsRetryDependencies,
): Promise<T>;
export function withWorkflowRunsRetry<T>(
    operation: () => Promise<T>,
    delayPort: WorkflowPollingDelayPort,
    policy: WorkflowRunsRetryPolicy,
): Promise<T>;
export function withWorkflowRunsRetry<T>(
    operation: () => Promise<T>,
    dependenciesOrDelayPort: WorkflowRunsRetryDependencies | WorkflowPollingDelayPort,
    legacyPolicy?: WorkflowRunsRetryPolicy,
): Promise<T> {
    const dependencies: WorkflowRunsRetryDependencies = 'clock' in dependenciesOrDelayPort
        ? dependenciesOrDelayPort
        : {
            delayPort: dependenciesOrDelayPort,
            clock: { nowMilliseconds: () => Date.now() },
            random: { next: () => 0.5 },
            policy: {
                ...WORKFLOW_RUNS_RETRY_POLICY,
                ...legacyPolicy,
                jitterRatio: 0,
            },
            deadlineAtMilliseconds: Number.POSITIVE_INFINITY,
        };
    return executeWithRetry(operation, dependencies, 1);
}

async function executeWithRetry<T>(
    operation: () => Promise<T>,
    dependencies: WorkflowRunsRetryDependencies,
    attempt: number,
): Promise<T> {
    if (dependencies.clock.nowMilliseconds() >= dependencies.deadlineAtMilliseconds) {
        throw new WorkflowQueueDeadlineError();
    }

    try {
        return await operation();
    } catch (error: unknown) {
        const classification = classifyWorkflowRunsError(error, dependencies.clock);
        if (!classification.retryable
            || (classification.reason === 'transient' && attempt >= dependencies.policy.maximumAttempts)) {
            throw error;
        }

        const delayMilliseconds = retryDelay(classification, attempt, dependencies);
        if (dependencies.clock.nowMilliseconds() + delayMilliseconds >= dependencies.deadlineAtMilliseconds) {
            throw new WorkflowQueueDeadlineError();
        }
        dependencies.observer?.providerRetry?.({
            reason: classification.reason,
            attempt,
            delayMilliseconds,
            ...(classification.resetEpochSeconds === undefined
                ? {}
                : { resetEpochSeconds: classification.resetEpochSeconds }),
        });
        await dependencies.delayPort.wait(delayMilliseconds);
        return executeWithRetry(operation, dependencies, attempt + 1);
    }
}

type RetryReason = 'rate_limit' | 'transient';

interface ErrorClassification {
    retryable: boolean;
    reason: RetryReason;
    retryAfterMilliseconds?: number;
    resetEpochSeconds?: number;
}

const TRANSIENT_NETWORK_ERRORS = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENETUNREACH',
    'ECONNREFUSED',
    'UND_ERR_CONNECT_TIMEOUT',
]);

function retryDelay(
    classification: ErrorClassification,
    attempt: number,
    dependencies: WorkflowRunsRetryDependencies,
): number {
    if (classification.retryAfterMilliseconds !== undefined) return classification.retryAfterMilliseconds;
    const { policy } = dependencies;
    const rateLimit = classification.reason === 'rate_limit';
    const baseDelay = Math.min(
        (rateLimit ? (policy.rateLimitInitialDelayMilliseconds ?? 60000) : policy.initialDelayMilliseconds)
            * policy.backoffMultiplier ** (attempt - 1),
        rateLimit ? (policy.rateLimitMaximumDelayMilliseconds ?? 300000) : policy.maximumDelayMilliseconds,
    );
    const jitterPolicy: Pick<WorkflowPollingPolicy, 'maximumDelayMilliseconds' | 'jitterRatio'> = {
        maximumDelayMilliseconds: rateLimit
            ? (policy.rateLimitMaximumDelayMilliseconds ?? 300000)
            : policy.maximumDelayMilliseconds,
        jitterRatio: policy.jitterRatio ?? 0,
    };
    return calculateJitteredWorkflowDelay(baseDelay, dependencies.random.next(), jitterPolicy);
}

function classifyWorkflowRunsError(
    error: unknown,
    clock: WorkflowQueueClockPort,
): ErrorClassification {
    if (!error || typeof error !== 'object') return { retryable: false, reason: 'transient' };
    const candidate = error as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        headers?: unknown;
        data?: { message?: unknown };
        response?: {
            status?: unknown;
            headers?: unknown;
            data?: { message?: unknown };
        };
        message?: unknown;
    };
    const status = firstNumericValue(candidate.status, candidate.statusCode, candidate.response?.status);
    const headers = candidate.response?.headers ?? candidate.headers;
    const message = [candidate.response?.data?.message, candidate.data?.message, candidate.message]
        .find(value => typeof value === 'string') as string | undefined;
    const remaining = header(headers, 'x-ratelimit-remaining');
    const isRateLimited = status === 429
        || (status === 403 && (remaining === '0'
            || /(?:rate limit|secondary rate|abuse limit|too many requests)/i.test(message ?? '')));
    if (isRateLimited) {
        const retryAfterMilliseconds = parseRetryAfter(header(headers, 'retry-after'), clock);
        const resetEpochSeconds = parseEpochSeconds(header(headers, 'x-ratelimit-reset'));
        const resetDelay = resetEpochSeconds === undefined
            ? undefined
            : Math.max(0, resetEpochSeconds * 1000 - clock.nowMilliseconds());
        return {
            retryable: true,
            reason: 'rate_limit',
            retryAfterMilliseconds: retryAfterMilliseconds ?? resetDelay,
            resetEpochSeconds,
        };
    }
    if (status === 408 || (status !== undefined && status >= 500)) {
        return { retryable: true, reason: 'transient' };
    }
    if (typeof candidate.code === 'string' && TRANSIENT_NETWORK_ERRORS.has(candidate.code)) {
        return { retryable: true, reason: 'transient' };
    }
    return {
        retryable: typeof message === 'string'
            && /\b(server error|service unavailable|bad gateway|gateway timeout|temporarily unavailable)\b/i.test(message),
        reason: 'transient',
    };
}

function header(headers: unknown, name: string): string | undefined {
    if (!headers) return undefined;
    if (typeof (headers as { get?: unknown }).get === 'function') {
        const value = (headers as { get(key: string): unknown }).get(name);
        return value === undefined || value === null ? undefined : String(value);
    }
    if (typeof headers !== 'object') return undefined;
    const entry = Object.entries(headers as Record<string, unknown>)
        .find(([key]) => key.toLowerCase() === name);
    return entry?.[1] === undefined || entry?.[1] === null ? undefined : String(entry[1]);
}

function parseRetryAfter(value: string | undefined, clock: WorkflowQueueClockPort): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
        ? Math.max(0, timestamp - clock.nowMilliseconds())
        : undefined;
}

function parseEpochSeconds(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const epoch = Number(value);
    return Number.isFinite(epoch) && epoch >= 0 ? epoch : undefined;
}

function firstNumericValue(...values: unknown[]): number | undefined {
    return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}