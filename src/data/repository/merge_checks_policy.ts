export interface MergeCheckRun {
    readonly status: string;
    readonly conclusion: string | null;
    readonly name: string;
    readonly pull_requests?: ReadonlyArray<{ readonly number: number }>;
}

export interface MergeStatus {
    readonly context: string;
    readonly state: string;
}

const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

/** GitHub has several non-success conclusions; merge policy must fail closed. */
export function blockingCheckRuns(checkRuns: ReadonlyArray<MergeCheckRun>): MergeCheckRun[] {
    return checkRuns.filter((check) => (
        check.status !== 'completed'
        || !SUCCESSFUL_CHECK_CONCLUSIONS.has(check.conclusion ?? '')
    ));
}

export function selectPullRequestChecks(
    checkRuns: ReadonlyArray<MergeCheckRun>,
    pullRequestNumber: number,
): MergeCheckRun[] {
    return checkRuns.filter((run) =>
        run.pull_requests?.some((pullRequest) => pullRequest.number === pullRequestNumber),
    );
}

export function pendingCheckRuns(checkRuns: ReadonlyArray<MergeCheckRun>): MergeCheckRun[] {
    return checkRuns.filter((check) => check.status !== 'completed');
}

export function failedCheckRuns(checkRuns: ReadonlyArray<MergeCheckRun>): MergeCheckRun[] {
    return checkRuns.filter((check) => check.conclusion === 'failure');
}

export function pendingStatuses(statuses: ReadonlyArray<MergeStatus>): MergeStatus[] {
    return statuses.filter((status) => status.state === 'pending');
}

export function blockingStatuses(statuses: ReadonlyArray<MergeStatus>): MergeStatus[] {
    return statuses.filter((status) => status.state !== 'success' && status.state !== 'pending');
}

export function isBlockingCombinedStatus(state: string): boolean {
    return state !== 'success' && state !== 'pending';
}
