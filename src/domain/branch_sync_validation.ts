/** Closed diagnostic vocabulary; workspace paths and provider output stay private. */
export const BRANCH_SYNC_VALIDATION_CODES = Object.freeze([
    'merge-state-mismatch', 'head-changed', 'merge-parent-changed',
    'unresolved-conflicts', 'unexpected-paths', 'unstaged-changes',
    'protected-index-changed', 'sdd-catalog-invalid', 'communication-budget-invalid', 'staging-failed',
    'whitespace-or-conflict-markers', 'parent-head-changed', 'working-head-changed',
    'unclassified',
] as const);

export type BranchSyncValidationCode = typeof BRANCH_SYNC_VALIDATION_CODES[number];

export function admittedBranchSyncValidationCode(value: unknown): BranchSyncValidationCode {
    return BRANCH_SYNC_VALIDATION_CODES.find(code => code === value) ?? 'unclassified';
}
