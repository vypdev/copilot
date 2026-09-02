import { resolveLifecycleWaitingState } from '../lifecycle_waiting_state_policy';

describe('lifecycle waiting state policy', () => {
    it.each([
        ['planned', 'awaiting-maintainer'],
        ['ready', 'awaiting-maintainer'],
        ['blocked', 'awaiting-maintainer'],
        ['changes-requested', 'awaiting-issue-author'],
    ] as const)('maps %s to %s', (lifecycleState, waitingState) => {
        expect(resolveLifecycleWaitingState({ eventName: 'issues', lifecycleState })).toEqual({
            kind: 'set',
            state: waitingState,
        });
    });

    it('clears waiting state when a route reaches another stable state', () => {
        expect(resolveLifecycleWaitingState({ eventName: 'issues', lifecycleState: 'in-progress' })).toEqual({ kind: 'clear' });
    });

    it('clears waiting state after a human interaction without a new stable state', () => {
        expect(resolveLifecycleWaitingState({ eventName: 'issue_comment', lifecycleState: undefined })).toEqual({ kind: 'clear' });
    });

    it('preserves waiting state for an unrelated lifecycle event', () => {
        expect(resolveLifecycleWaitingState({ eventName: 'workflow_dispatch', lifecycleState: undefined })).toEqual({ kind: 'preserve' });
    });
});
