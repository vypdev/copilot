import {
    failedCheckRuns,
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

    it('identifies pending combined statuses', () => {
        expect(pendingStatuses([
            { context: 'build', state: 'pending' },
            { context: 'lint', state: 'success' },
        ])).toEqual([{ context: 'build', state: 'pending' }]);
    });
});
