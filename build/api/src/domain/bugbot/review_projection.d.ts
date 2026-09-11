import { type BugbotFindingState, type BugbotFindingStateCounts } from './review_state';
export type BugbotProjectionOutcome = 'complete' | 'partial' | 'failed' | 'superseded' | 'dry-run';
export interface BugbotProjectedFinding {
    readonly id: string;
    readonly state: BugbotFindingState;
    readonly title?: string;
    readonly url?: string;
    readonly parentReviewIdentity?: string;
}
export interface BugbotReviewProjection {
    readonly schemaVersion: 1;
    readonly pullRequestNumber: number;
    readonly analyzedHeadSha: string;
    readonly verifiedHeadSha: string;
    readonly findings: readonly BugbotProjectedFinding[];
    readonly counts: Readonly<BugbotFindingStateCounts>;
    readonly actionableCount: number;
    readonly outcome: BugbotProjectionOutcome;
    readonly errors: readonly string[];
    readonly digest: string;
}
export declare function buildBugbotReviewProjection(input: {
    pullRequestNumber: number;
    analyzedHeadSha: string;
    verifiedHeadSha?: string;
    findings: readonly BugbotProjectedFinding[];
    errors?: readonly string[];
    superseded?: boolean;
    dryRun?: boolean;
}): BugbotReviewProjection;
