export const WORKFLOW_STATUS = {
    IN_PROGRESS: 'in_progress',
    QUEUED: 'queued',
    REQUESTED: 'requested',
    WAITING: 'waiting',
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    SKIPPED: 'skipped',
    TIMED_OUT: 'timed_out',
} as const;

export const WORKFLOW_ACTIVE_STATUSES: readonly string[] = [
    WORKFLOW_STATUS.IN_PROGRESS,
    WORKFLOW_STATUS.QUEUED,
    WORKFLOW_STATUS.REQUESTED,
    WORKFLOW_STATUS.WAITING,
    WORKFLOW_STATUS.PENDING,
] as const;
