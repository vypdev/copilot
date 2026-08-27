export interface MergeCheckRun {
    readonly status: string;
    readonly conclusion: string | null;
    readonly name: string;
    readonly pull_requests?: ReadonlyArray<{
        readonly number: number;
    }>;
}
export interface MergeStatus {
    readonly context: string;
    readonly state: string;
}
export declare function selectPullRequestChecks(checkRuns: ReadonlyArray<MergeCheckRun>, pullRequestNumber: number): MergeCheckRun[];
export declare function pendingCheckRuns(checkRuns: ReadonlyArray<MergeCheckRun>): MergeCheckRun[];
export declare function failedCheckRuns(checkRuns: ReadonlyArray<MergeCheckRun>): MergeCheckRun[];
export declare function pendingStatuses(statuses: ReadonlyArray<MergeStatus>): MergeStatus[];
