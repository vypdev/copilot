export declare const CLOSED_ISSUE_RESULTS: readonly ["ReconcileClosedIssueMetadataUseCase", "CloseIssueAfterMergingUseCase", "RetireBranchSyncUseCase", "RetireProgressUseCase"];
export declare const CLOSED_ISSUE_PHASES: readonly ["identity", "read", "native-fence", "label-remove", "label-add", "metadata-verification", "card-inventory", "card-freshness", "card-update", "card-verification"];
export declare const CLOSED_ISSUE_REASONS: readonly ["completed", "not_planned", "duplicate", "reopened", "unknown", "unavailable"];
export type ClosedIssueReconciliationFacts = {
    readonly resultId: typeof CLOSED_ISSUE_RESULTS[number];
    readonly phase: typeof CLOSED_ISSUE_PHASES[number];
    readonly state: 'open' | 'closed' | 'unavailable';
    readonly reason: typeof CLOSED_ISSUE_REASONS[number];
    readonly changed: number;
    readonly remaining: number;
};
