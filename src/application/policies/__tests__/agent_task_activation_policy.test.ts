import { activeAgentTasks } from '../agent_task_activation_policy';
import { SingleAction } from '../../../data/model/single_action';
import { ACTIONS } from '../../../data/model/action_types';
import type { GithubActionEventInputs } from '../../../actions/github_event_inputs';

const event = (eventName: string, body = '', extra: Record<string, unknown> = {}) => ({
    eventName,
    actor: 'alice',
    repo: { owner: 'o', repo: 'r' },
    comment: { body },
    ...extra,
}) as GithubActionEventInputs;

const noSingleAction = () => new SingleAction('', '', '', '', '');

describe('activeAgentTasks', () => {
    it('selects only roles reachable from lifecycle events', () => {
        expect(activeAgentTasks(event('issues', '', { action: 'opened' }), noSingleAction())).toEqual(['planner']);
        expect(activeAgentTasks(event('pull_request', '', { action: 'opened' }), noSingleAction())).toEqual(['planner', 'reviewer']);
        expect(activeAgentTasks(event('push'), noSingleAction())).toEqual(['findings']);
    });

    it('does no agent work for metadata-only lifecycle events', () => {
        expect(activeAgentTasks(event('issues', '', { action: 'labeled' }), noSingleAction())).toEqual([]);
        expect(activeAgentTasks(event('pull_request', '', { action: 'edited' }), noSingleAction())).toEqual([]);
        expect(activeAgentTasks(event('pull_request', '', { action: 'closed' }), noSingleAction())).toEqual([]);
        expect(activeAgentTasks(event('pull_request_review', '', { action: 'submitted' }), noSingleAction())).toEqual([]);
    });

    it('does not activate planner when automatic PR descriptions are disabled', () => {
        expect(activeAgentTasks(event('pull_request', '', { action: 'synchronize' }), noSingleAction(), '', false))
            .toEqual(['reviewer']);
    });

    it('does not provision an agent for metadata-only comment commands', () => {
        expect(activeAgentTasks(event('issue_comment', '/copilot help'), noSingleAction(), 'vypbot')).toEqual([]);
        expect(activeAgentTasks(event('issue_comment', '/copilot status'), noSingleAction(), 'vypbot')).toEqual([]);
    });

    it('selects specialist roles for explicit comment commands', () => {
        expect(activeAgentTasks(event('issue_comment', '/copilot implement add tests'), noSingleAction(), 'vypbot'))
            .toEqual(['fixer']);
        expect(activeAgentTasks(event('issue_comment', '/copilot test-plan'), noSingleAction(), 'vypbot'))
            .toEqual(['tester']);
        expect(activeAgentTasks(event('issue_comment', '/copilot review', { issue: { pull_request: {} } }), noSingleAction(), 'vypbot'))
            .toEqual(['reviewer']);
        expect(activeAgentTasks(event('issue_comment', '/copilot fix all'), noSingleAction(), 'vypbot'))
            .toEqual(['fixer', 'findings']);
        expect(activeAgentTasks(event('issue_comment', '/copilot fix all', { issue: { pull_request: {} } }), noSingleAction(), 'vypbot'))
            .toEqual(['fixer', 'reviewer']);
        expect(activeAgentTasks(event('issue_comment', '/copilot description'), noSingleAction(), 'vypbot'))
            .toEqual([]);
        expect(activeAgentTasks(event('issue_comment', '/copilot sync-branch'), noSingleAction(), 'vypbot'))
            .toEqual(['fixer']);
        expect(activeAgentTasks(event('issue_comment', '/copilot updateBranch'), noSingleAction(), 'vypbot'))
            .toEqual(['fixer']);
        expect(activeAgentTasks(event('issue_comment', '/copilot sync-branch --dry-run'), noSingleAction(), 'vypbot'))
            .toEqual([]);
        expect(activeAgentTasks(event('issue_comment', '/copilot sync-branch --no-agent'), noSingleAction(), 'vypbot'))
            .toEqual([]);
    });

    it('uses findings only for translation and all reachable roles for mentioned natural language', () => {
        expect(activeAgentTasks(event('issue_comment', 'translate this'), noSingleAction(), 'vypbot')).toEqual(['findings']);
        expect(activeAgentTasks(event('issue_comment', '@vypbot please review and fix this'), noSingleAction(), 'vypbot'))
            .toEqual(['findings', 'fixer', 'planner']);
        expect(activeAgentTasks(event('issue_comment', "@vypbot update the issue's branch"), noSingleAction(), 'vypbot'))
            .toEqual(['fixer']);
        expect(activeAgentTasks(event('issue_comment', '@vypbot please review and fix this', { issue: { pull_request: {} } }), noSingleAction(), 'vypbot'))
            .toEqual(['findings', 'fixer', 'planner', 'reviewer']);
    });

    it('prepares both possible review roles before a single-action target is resolved', () => {
        const single = new SingleAction(ACTIONS.DETECT_POTENTIAL_PROBLEMS, '42', '', '', '');
        expect(activeAgentTasks(event('workflow_dispatch'), single)).toEqual(['findings', 'reviewer']);
    });

    it('maps every agent-backed single action and explicit planning command', () => {
        expect(activeAgentTasks(event('workflow_dispatch'), new SingleAction(ACTIONS.THINK, '', '', '', '')))
            .toEqual(['planner']);
        expect(activeAgentTasks(event('workflow_dispatch'), new SingleAction(ACTIONS.RECOMMEND_STEPS, '', '', '', '')))
            .toEqual(['planner']);
        expect(activeAgentTasks(event('workflow_dispatch'), new SingleAction(ACTIONS.CHECK_PROGRESS, '', '', '', '')))
            .toEqual(['findings']);
        expect(activeAgentTasks(event('workflow_dispatch'), new SingleAction('unsupported', '', '', '', '')))
            .toEqual([]);
        expect(activeAgentTasks(event('push'), new SingleAction(ACTIONS.CHECK_BRANCH_SYNC, '', '', '', '')))
            .toEqual([]);
        expect(activeAgentTasks(event('issue_comment', '/copilot diagnose failure'), noSingleAction(), 'vypbot'))
            .toEqual(['planner']);
        expect(activeAgentTasks(event('pull_request_review_comment', '/copilot description'), noSingleAction(), 'vypbot'))
            .toEqual(['planner']);
    });

    it('handles malformed event payloads without provisioning extra agents', () => {
        expect(activeAgentTasks(event('issues', '', { action: 42 }), noSingleAction())).toEqual([]);
        expect(activeAgentTasks(event('issue_comment', '', { comment: null }), noSingleAction(), 'vypbot'))
            .toEqual(['findings']);
        expect(activeAgentTasks(event('unknown'), noSingleAction())).toEqual([]);
    });
});
