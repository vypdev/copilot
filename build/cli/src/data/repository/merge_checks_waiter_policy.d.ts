import { type MergeCheckRun, type MergeStatus } from './merge_checks_policy';
export type MergeChecksPollAssessment = {
    kind: 'completed';
    source: 'pull-request-checks' | 'status-checks';
    nextRegistrationAttempts: number;
    checkRuns: MergeCheckRun[];
} | {
    kind: 'pending-check-runs';
    nextRegistrationAttempts: number;
    pendingChecks: MergeCheckRun[];
} | {
    kind: 'waiting-for-registration';
    nextRegistrationAttempts: number;
} | {
    kind: 'fallback-status-checks';
    nextRegistrationAttempts: number;
    statuses: MergeStatus[];
} | {
    kind: 'pending-status-checks';
    nextRegistrationAttempts: number;
    statuses: MergeStatus[];
};
interface MergeChecksPollInput {
    checkRuns: ReadonlyArray<MergeCheckRun>;
    pullRequestNumber: number;
    combinedStatus: string;
    statuses: ReadonlyArray<MergeStatus>;
    registrationAttempts: number;
    maximumRegistrationAttempts: number;
}
/** Decides whether one merge-check poll can finish or must keep waiting. */
export declare function assessMergeChecksPoll(input: MergeChecksPollInput): MergeChecksPollAssessment;
export {};
