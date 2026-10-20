export const CLOSED_ISSUE_RESULTS = Object.freeze([
    'ReconcileClosedIssueMetadataUseCase', 'CloseIssueAfterMergingUseCase', 'RetireBranchSyncUseCase', 'RetireProgressUseCase',
] as const);
export const CLOSED_ISSUE_PHASES = Object.freeze([
    'identity', 'read', 'native-fence', 'label-remove', 'label-add', 'metadata-verification',
    'card-inventory', 'card-freshness', 'card-update', 'card-verification',
] as const);
export const CLOSED_ISSUE_REASONS = Object.freeze(['completed', 'not_planned', 'duplicate', 'reopened', 'unknown', 'unavailable'] as const);
export type ClosedIssueReconciliationFacts = {
    readonly resultId: typeof CLOSED_ISSUE_RESULTS[number];
    readonly phase: typeof CLOSED_ISSUE_PHASES[number];
    readonly state: 'open' | 'closed' | 'unavailable';
    readonly reason: typeof CLOSED_ISSUE_REASONS[number];
    readonly changed: number;
    readonly remaining: number;
};
