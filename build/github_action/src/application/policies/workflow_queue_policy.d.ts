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
