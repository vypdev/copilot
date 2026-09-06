/**
 * Workflows that execute the Copilot action. Keep these names aligned with
 * workflow `name` values in `.github/workflows` and the setup templates.
 * Queue admission is scoped to the current workflow file; this list is kept
 * for workflow-contract validation.
 */
export declare const COPILOT_WORKFLOW_NAMES: readonly ["Copilot - Issue", "Copilot - Issue Comment", "Copilot - Commit", "Copilot - Pull Request", "Copilot - Pull Request Comment", "Copilot - Close Inactive Issues", "Task - Hotfix", "Task - Release"];
export interface WorkflowPollingPolicy {
    maximumQueueWaitMilliseconds: number;
    initialDelayMilliseconds: number;
    backoffMultiplier: number;
    maximumDelayMilliseconds: number;
    jitterRatio: number;
}
export declare const WORKFLOW_QUEUE_POLICY: WorkflowPollingPolicy;
export declare function calculateWorkflowPollingDelay(pollIndex: number, randomValue: number, policy?: WorkflowPollingPolicy): number;
export declare function calculateJitteredWorkflowDelay(baseDelayMilliseconds: number, randomValue: number, policy: Pick<WorkflowPollingPolicy, 'maximumDelayMilliseconds' | 'jitterRatio'>): number;
