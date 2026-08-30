import { resolveLifecycleState } from '../lifecycle_state_policy';

const result = (id: string, success = true) => ({ id, success, executed: true, steps: [], errors: [] });

describe('lifecycle state policy', () => {
    it('moves an issue to analyzing, planned, and in-progress based on route facts', () => {
        expect(resolveLifecycleState({ eventName: 'issues', action: 'opened', isIssue: true, isPullRequest: false, issueOpened: true, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false, results: [] })).toBe('analyzing');
        expect(resolveLifecycleState({ eventName: 'issues', action: 'edited', isIssue: true, isPullRequest: false, issueOpened: false, issueDescriptionEdited: true, pullRequestMerged: false, pullRequestClosed: false, results: [result('RecommendStepsUseCase')] })).toBe('planned');
        expect(resolveLifecycleState({ eventName: 'issues', action: 'labeled', isIssue: true, isPullRequest: false, issueOpened: false, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false, results: [result('PrepareBranchesUseCase')] })).toBe('in-progress');
    });

    it('moves a PR to reviewing, verified, or blocked', () => {
        const base = { eventName: 'pull_request', isIssue: false, isPullRequest: true, issueOpened: false, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false };
        expect(resolveLifecycleState({ ...base, action: 'synchronize', results: [] })).toBe('reviewing');
        expect(resolveLifecycleState({ ...base, action: 'closed', pullRequestMerged: true, pullRequestClosed: true, results: [] })).toBe('verified');
        expect(resolveLifecycleState({ ...base, action: 'opened', results: [result('step', false)] })).toBe('blocked');
    });
});

