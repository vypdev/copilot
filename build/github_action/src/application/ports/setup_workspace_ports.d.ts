import type { SetupFeatures, SetupWorkflowComparison } from '../../domain/setup';
export interface SetupWorkspaceResult {
    copied: number;
    skipped: number;
}
export interface SetupWorkspaceSelection {
    features?: SetupFeatures;
    updateExistingWorkflows?: boolean;
    approvedWorkflowFiles?: readonly string[];
}
export interface SetupWorkspacePort {
    prepare(selection?: SetupWorkspaceSelection): SetupWorkspaceResult;
    hasValidToken(tokenOverride?: string): boolean;
    compareWorkflows?(features?: SetupFeatures): readonly SetupWorkflowComparison[];
}
