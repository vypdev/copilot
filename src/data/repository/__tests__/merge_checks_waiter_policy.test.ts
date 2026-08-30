import { assessMergeChecksPoll } from '../merge_checks_waiter_policy';

const completedCheck = {
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    pull_requests: [{ number: 12 }],
};

describe('assessMergeChecksPoll', () => {
    it('completes when the pull request checks are successful', () => {
        expect(assessMergeChecksPoll({
            checkRuns: [completedCheck],
            pullRequestNumber: 12,
            combinedStatus: 'success',
            statuses: [],
            registrationAttempts: 0,
            maximumRegistrationAttempts: 3,
        })).toMatchObject({ kind: 'completed', source: 'pull-request-checks' });
    });

    it('waits for pending checks belonging to the pull request', () => {
        expect(assessMergeChecksPoll({
            checkRuns: [{ ...completedCheck, status: 'in_progress', conclusion: null }],
            pullRequestNumber: 12,
            combinedStatus: 'pending',
            statuses: [],
            registrationAttempts: 0,
            maximumRegistrationAttempts: 3,
        })).toMatchObject({ kind: 'pending-check-runs' });
    });

    it('allows status checks after workflows have registered without PR metadata', () => {
        expect(assessMergeChecksPoll({
            checkRuns: [{ ...completedCheck, pull_requests: [] }],
            pullRequestNumber: 12,
            combinedStatus: 'pending',
            statuses: [{ context: 'legacy', state: 'pending' }],
            registrationAttempts: 2,
            maximumRegistrationAttempts: 3,
        })).toMatchObject({ kind: 'fallback-status-checks', nextRegistrationAttempts: 3 });
    });

    it('waits for PR metadata before falling back', () => {
        expect(assessMergeChecksPoll({
            checkRuns: [{ ...completedCheck, pull_requests: [] }],
            pullRequestNumber: 12,
            combinedStatus: 'pending',
            statuses: [],
            registrationAttempts: 0,
            maximumRegistrationAttempts: 3,
        })).toMatchObject({ kind: 'waiting-for-registration', nextRegistrationAttempts: 1 });
    });

    it('uses status checks when there are no check runs', () => {
        expect(assessMergeChecksPoll({
            checkRuns: [],
            pullRequestNumber: 12,
            combinedStatus: 'success',
            statuses: [],
            registrationAttempts: 0,
            maximumRegistrationAttempts: 3,
        })).toMatchObject({ kind: 'completed', source: 'status-checks' });
    });
});
