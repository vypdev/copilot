export declare const CHANGE_SIZE_OPERATIONS: readonly ["calculate-size", "issue-labels", "issue-project-size", "list-pull-requests", "pr-label-read", "pr-label-write", "pr-project-membership", "pr-project-size"];
export type ChangeSizeOperation = typeof CHANGE_SIZE_OPERATIONS[number];
/** Only bounded identifiers and closed operation names cross the public error boundary. */
export interface ChangeSizeReconciliationFacts {
    readonly operation: ChangeSizeOperation;
    readonly issueNumber: number;
    readonly targetNumber: number;
    /** One-based configured Project position; zero means no Project operation. */
    readonly projectIndex: number;
    readonly verifiedOperations: number;
    readonly pendingProjectSizes: number;
    readonly providerStatus: string;
    readonly providerReference: string;
}
export declare function isChangeSizeReconciliationFacts(value: Readonly<Record<string, unknown>>): boolean;
