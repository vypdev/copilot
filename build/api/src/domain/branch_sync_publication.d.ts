export declare const BRANCH_SYNC_PUBLICATION_REASONS: readonly ["workflow-write-required", "push-failed", "candidate-unverified"];
export declare const BRANCH_SYNC_REMOTE_STATES: readonly ["unchanged", "published", "changed", "unverified"];
export interface BranchSyncPublicationDiagnostic {
    readonly reason: typeof BRANCH_SYNC_PUBLICATION_REASONS[number];
    readonly remoteState: typeof BRANCH_SYNC_REMOTE_STATES[number];
    readonly originalSha: string;
    readonly candidateSha: string;
    readonly observedSha: string;
    readonly pushAttempted: boolean;
}
export declare function isBranchSyncObjectId(value: unknown): value is string;
export declare function admittedBranchSyncObjectId(value: unknown): string;
export declare function isBranchSyncPublicationDiagnostic(value: unknown): value is BranchSyncPublicationDiagnostic;
/** A committed candidate is no longer an in-progress Git merge. */
export declare class BranchSyncPublicationFailure extends Error {
    readonly diagnostic: BranchSyncPublicationDiagnostic;
    constructor(diagnostic: BranchSyncPublicationDiagnostic);
}
