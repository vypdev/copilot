/**
 * Workflows that execute the Copilot action and therefore share its
 * repository mutation queue. Keep these names aligned with workflow `name`
 * values in `.github/workflows` and the setup templates.
 */
export const COPILOT_WORKFLOW_NAMES = [
    'Copilot - Issue',
    'Copilot - Issue Comment',
    'Copilot - Commit',
    'Copilot - Pull Request',
    'Copilot - Pull Request Comment',
    'Task - Hotfix',
    'Task - Release',
] as const;

export interface WorkflowPollingPolicy {
    maximumQueueWaitMilliseconds: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
    jitterRatio: number;
}

export const WORKFLOW_QUEUE_POLICY: WorkflowPollingPolicy = {
    maximumQueueWaitMilliseconds: 90 * 60 * 1000,
    initialDelayMilliseconds: 5 * 1000,
    backoffMultiplier: 2,
    maximumDelayMilliseconds: 60 * 1000,
    jitterRatio: 0.2,
};

export function calculateWorkflowPollingDelay(
    pollIndex: number,
    randomValue: number,
    policy: WorkflowPollingPolicy = WORKFLOW_QUEUE_POLICY,
): number {
    const baseDelay = Math.min(
        policy.initialDelayMilliseconds * policy.backoffMultiplier ** pollIndex,
        policy.maximumDelayMilliseconds,
    );
    return calculateJitteredWorkflowDelay(baseDelay, randomValue, policy);
}

export function calculateJitteredWorkflowDelay(
    baseDelayMilliseconds: number,
    randomValue: number,
    policy: Pick<WorkflowPollingPolicy, 'maximumDelayMilliseconds' | 'jitterRatio'>,
): number {
    const boundedRandom = Math.min(1, Math.max(0, randomValue));
    const jitter = (boundedRandom * 2 - 1) * policy.jitterRatio;
    return Math.min(
        policy.maximumDelayMilliseconds,
        Math.max(0, Math.round(baseDelayMilliseconds * (1 + jitter))),
    );
}
