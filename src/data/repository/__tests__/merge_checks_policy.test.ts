import {
    blockingCheckRuns,
    blockingStatuses,
    failedCheckRuns,
    isBlockingCombinedStatus,
    pendingCheckRuns,
    pendingStatuses,
    selectPullRequestChecks,
} from '../merge_checks_policy';

describe('merge checks policy', () => {
    const checks = [
        { name: 'current', status: 'completed', conclusion: 'success', pull_requests: [{ number: 7 }] },
        { name: 'other', status: 'completed', conclusion: 'failure', pull_requests: [{ number: 8 }] },
        { name: 'pending', status: 'queued', conclusion: null, pull_requests: [{ number: 7 }] },
    ];

    it('selects checks belonging to the current pull request', () => {
        expect(selectPullRequestChecks(checks, 7).map((check) => check.name)).toEqual(['current', 'pending']);
    });

    it('identifies pending and failed checks', () => {
        const currentChecks = selectPullRequestChecks(checks, 7);
        expect(pendingCheckRuns(currentChecks).map((check) => check.name)).toEqual(['pending']);
        expect(failedCheckRuns(checks).map((check) => check.name)).toEqual(['other']);
    });

    it('blocks every non-success completed conclusion', () => {
        expect(blockingCheckRuns([
            { name: 'success', status: 'completed', conclusion: 'success' },
            { name: 'skipped', status: 'completed', conclusion: 'skipped' },
            { name: 'neutral', status: 'completed', conclusion: 'neutral' },
            { name: 'cancelled', status: 'completed', conclusion: 'cancelled' },
            { name: 'timed out', status: 'completed', conclusion: 'timed_out' },
            { name: 'unknown', status: 'completed', conclusion: null },
        ]).map((check) => check.name)).toEqual(['cancelled', 'timed out', 'unknown']);
    });

    it('identifies pending combined statuses', () => {
        expect(pendingStatuses([
            { context: 'build', state: 'pending' },
            { context: 'lint', state: 'success' },
        ])).toEqual([{ context: 'build', state: 'pending' }]);
    });

    it('blocks failed, errored and unknown status contexts', () => {
        expect(blockingStatuses([
            { context: 'build', state: 'success' },
            { context: 'lint', state: 'failure' },
            { context: 'security', state: 'error' },
            { context: 'unknown', state: 'unknown' },
        ])).toEqual([
            { context: 'lint', state: 'failure' },
            { context: 'security', state: 'error' },
            { context: 'unknown', state: 'unknown' },
        ]);
        expect(isBlockingCombinedStatus('failure')).toBe(true);
        expect(isBlockingCombinedStatus('error')).toBe(true);
        expect(isBlockingCombinedStatus('success')).toBe(false);
        expect(isBlockingCombinedStatus('pending')).toBe(false);
    });
});
