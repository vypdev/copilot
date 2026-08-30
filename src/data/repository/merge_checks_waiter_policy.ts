import {
    pendingCheckRuns,
    pendingStatuses,
    selectPullRequestChecks,
    type MergeCheckRun,
    type MergeStatus,
} from './merge_checks_policy';

export type MergeChecksPollAssessment =
    | {
        kind: 'completed';
        source: 'pull-request-checks' | 'status-checks';
        nextRegistrationAttempts: number;
        checkRuns: MergeCheckRun[];
    }
    | {
        kind: 'pending-check-runs';
        nextRegistrationAttempts: number;
        pendingChecks: MergeCheckRun[];
    }
    | {
        kind: 'waiting-for-registration';
        nextRegistrationAttempts: number;
    }
    | {
        kind: 'fallback-status-checks';
        nextRegistrationAttempts: number;
        statuses: MergeStatus[];
    }
    | {
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
export function assessMergeChecksPoll(input: MergeChecksPollInput): MergeChecksPollAssessment {
    const runsForPullRequest = selectPullRequestChecks(input.checkRuns, input.pullRequestNumber);
    if (runsForPullRequest.length > 0) {
        return assessPullRequestChecks(
            runsForPullRequest,
            input.combinedStatus,
            input.registrationAttempts,
        );
    }

    return assessRefChecks(
        input.checkRuns.length,
        input.combinedStatus,
        input.statuses,
        input.registrationAttempts,
        input.maximumRegistrationAttempts,
    );
}

function assessPullRequestChecks(
    checkRuns: MergeCheckRun[],
    combinedStatus: string,
    registrationAttempts: number,
): MergeChecksPollAssessment {
    const pendingChecks = pendingCheckRuns(checkRuns);
    if (pendingChecks.length === 0 && combinedStatus !== 'pending') {
        return {
            kind: 'completed',
            source: 'pull-request-checks',
            nextRegistrationAttempts: registrationAttempts,
            checkRuns,
        };
    }
    return {
        kind: 'pending-check-runs',
        nextRegistrationAttempts: registrationAttempts,
        pendingChecks,
    };
}

function assessRefChecks(
    totalCheckRuns: number,
    combinedStatus: string,
    statuses: ReadonlyArray<MergeStatus>,
    registrationAttempts: number,
    maximumRegistrationAttempts: number,
): MergeChecksPollAssessment {
    const nextRegistrationAttempts = totalCheckRuns > 0
        ? registrationAttempts + 1
        : registrationAttempts;

    if (totalCheckRuns > 0 && nextRegistrationAttempts < maximumRegistrationAttempts) {
        return { kind: 'waiting-for-registration', nextRegistrationAttempts };
    }

    if (statusChecksAreComplete(combinedStatus, statuses)) {
        return {
            kind: 'completed',
            source: 'status-checks',
            nextRegistrationAttempts,
            checkRuns: [],
        };
    }

    if (totalCheckRuns > 0) {
        return {
            kind: 'fallback-status-checks',
            nextRegistrationAttempts,
            statuses: [...statuses],
        };
    }

    return {
        kind: 'pending-status-checks',
        nextRegistrationAttempts,
        statuses: [...statuses],
    };
}

function statusChecksAreComplete(combinedStatus: string, statuses: ReadonlyArray<MergeStatus>): boolean {
    return pendingStatuses(statuses).length === 0 && combinedStatus !== 'pending';
}
