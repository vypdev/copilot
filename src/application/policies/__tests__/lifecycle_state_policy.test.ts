import { resolveLifecycleState } from '../lifecycle_state_policy';

const result = (id: string, success = true) => ({ id, success, executed: true, steps: [], errors: [] });

describe('lifecycle state policy', () => {
    it('moves an issue to planned and in-progress while agent activity remains separate', () => {
        expect(resolveLifecycleState({ eventName: 'issues', action: 'opened', isIssue: true, isPullRequest: false, issueOpened: true, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false, results: [] })).toBeUndefined();
        expect(resolveLifecycleState({ eventName: 'issues', action: 'edited', isIssue: true, isPullRequest: false, issueOpened: false, issueDescriptionEdited: true, pullRequestMerged: false, pullRequestClosed: false, results: [result('RecommendStepsUseCase')] })).toBe('planned');
        expect(resolveLifecycleState({ eventName: 'issues', action: 'labeled', isIssue: true, isPullRequest: false, issueOpened: false, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false, results: [result('PrepareBranchesUseCase')] })).toBe('in-progress');
    });

    it('moves a PR to reviewing, verified, or blocked', () => {
        const base = { eventName: 'pull_request', isIssue: false, isPullRequest: true, issueOpened: false, issueDescriptionEdited: false, pullRequestMerged: false, pullRequestClosed: false };
        expect(resolveLifecycleState({ ...base, action: 'synchronize', results: [] })).toBe('reviewing');
        expect(resolveLifecycleState({ ...base, action: 'closed', pullRequestMerged: true, pullRequestClosed: true, results: [] })).toBe('verified');
        expect(resolveLifecycleState({ ...base, action: 'opened', results: [result('step', false)] })).toBe('blocked');
    });

    it('moves a PR to changes-requested when active findings remain', () => {
        expect(resolveLifecycleState({
            eventName: 'pull_request',
            action: 'synchronize',
            isIssue: false,
            isPullRequest: true,
            issueOpened: false,
            issueDescriptionEdited: false,
            pullRequestMerged: false,
            pullRequestClosed: false,
            results: [{ ...result('DetectPotentialProblemsUseCase'), payload: { findingStates: { open: 1, reopened: 0 } } }],
        })).toBe('changes-requested');
    });

    it('moves a successful finding-free PR review to ready', () => {
        expect(resolveLifecycleState({
            eventName: 'pull_request',
            action: 'synchronize',
            isIssue: false,
            isPullRequest: true,
            issueOpened: false,
            issueDescriptionEdited: false,
            pullRequestMerged: false,
            pullRequestClosed: false,
            results: [{ ...result('DetectPotentialProblemsUseCase'), payload: { findingStates: { open: 0, reopened: 0 } } }],
        })).toBe('ready');
    });

    it('moves an explicit planning command on an issue to planned', () => {
        expect(resolveLifecycleState({
            eventName: 'issue_comment',
            action: 'created',
            isIssue: true,
            isPullRequest: false,
            issueOpened: false,
            issueDescriptionEdited: false,
            pullRequestMerged: false,
            pullRequestClosed: false,
            results: [{ ...result('CommentAutomation.ExplicitCommand'), payload: { explicitCommand: 'plan' } }],
        })).toBe('planned');
    });
});
