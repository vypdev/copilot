import { readLifecycleExternalEvidence, resolveLifecycleState } from '../lifecycle_state_policy';

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

    it('uses external review and check evidence without changing the legacy fallback', () => {
        const base = {
            eventName: 'pull_request_review',
            action: 'submitted',
            isIssue: false,
            isPullRequest: true,
            issueOpened: false,
            issueDescriptionEdited: false,
            pullRequestMerged: false,
            pullRequestClosed: false,
            results: [],
        };
        expect(resolveLifecycleState({ ...base, externalEvidence: { review: 'changes-requested' } })).toBe('changes-requested');
        expect(resolveLifecycleState({ ...base, externalEvidence: { review: 'approved', checks: 'pending' } })).toBe('reviewing');
        expect(resolveLifecycleState({ ...base, externalEvidence: { review: 'approved', checks: 'success' } })).toBe('ready');
        expect(resolveLifecycleState({ ...base, externalEvidence: { checks: 'failure' } })).toBe('blocked');
    });

    it('normalizes GitHub review and check payloads into stable evidence', () => {
        expect(readLifecycleExternalEvidence({
            eventName: 'pull_request_review',
            review: { state: 'changes_requested' },
        })).toEqual({ review: 'changes-requested' });
        expect(readLifecycleExternalEvidence({
            eventName: 'check_suite',
            check_suite: { status: 'completed', conclusion: 'success', workflow_name: 'CI Check', head_sha: 'sha-1' },
        }, 'sha-1')).toEqual({ checks: 'success' });
        expect(readLifecycleExternalEvidence({
            eventName: 'workflow_run',
            workflow_run: { name: 'CI Check', status: 'in_progress', conclusion: null, head_sha: 'sha-1' },
        }, 'sha-1')).toEqual({ checks: 'pending' });
    });

    it('ignores unrelated or stale validation evidence', () => {
        expect(readLifecycleExternalEvidence({
            eventName: 'workflow_run',
            workflow_run: { name: 'Unrelated workflow', status: 'completed', conclusion: 'failure', head_sha: 'sha-1' },
        }, 'sha-1')).toBeUndefined();
        expect(readLifecycleExternalEvidence({
            eventName: 'workflow_run',
            workflow_run: { name: 'CI Check', status: 'completed', conclusion: 'failure', head_sha: 'old-sha' },
        }, 'sha-1')).toBeUndefined();
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
