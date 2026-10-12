/** Closed diagnostic vocabulary; workspace paths and provider output stay private. */
export declare const BRANCH_SYNC_VALIDATION_CODES: readonly ["merge-state-mismatch", "head-changed", "merge-parent-changed", "unresolved-conflicts", "unexpected-paths", "unstaged-changes", "protected-index-changed", "sdd-catalog-invalid", "communication-budget-invalid", "staging-failed", "whitespace-or-conflict-markers", "parent-head-changed", "working-head-changed", "unclassified"];
export type BranchSyncValidationCode = typeof BRANCH_SYNC_VALIDATION_CODES[number];
export declare function admittedBranchSyncValidationCode(value: unknown): BranchSyncValidationCode;
