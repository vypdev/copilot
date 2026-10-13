import { IssueCommentUseCase } from '../issue_comment_use_case';
import { PullRequestReviewCommentUseCase } from '../pull_request_review_comment_use_case';
import { parseCopilotCommand } from '../../../domain/copilot_command';
import { activeAgentTasks } from '../../policies/agent_task_activation_policy';
import type { Execution } from '../../../data/model/execution';
const forbidden = { taskId: 'ForbiddenFixture', invoke: jest.fn(async () => { throw new Error('Forbidden capability reached'); }) };
const coverage = { source: 'issue-comments' as const, status: 'complete' as const, pagesFetched: 1, itemsFetched: 0, itemsRetained: 0, omittedItems: 0, truncatedItems: 0, limitReached: false };
function setup(kind: 'issue'|'pr', eventName = 'issue_comment', command = '/copilot history') {
    const readComments = jest.fn().mockResolvedValue({ value: [], coverage });
    const port = { serverOrigin: 'https://github.com', readComments };
    const useCase = kind === 'issue' ? new IssueCommentUseCase(forbidden,forbidden,forbidden,forbidden,forbidden,{} as never,{} as never,
        undefined,undefined,undefined,undefined,undefined,forbidden as never,undefined,undefined,port)
        : new PullRequestReviewCommentUseCase(forbidden,forbidden,forbidden,forbidden,forbidden,{} as never,{} as never,
            undefined,undefined,undefined,undefined,undefined,undefined,undefined,port);
    const input = { owner: 'acme', repo: 'widget', tokenUser: 'vypbot', eventName,
        issue: { number: 42, commentId: 100, commentBody: command },
        pullRequest: { number: 75, commentId: 100, commentBody: command }, locale: { issue: 'es-ES', pullRequest: 'en-US' },
        get issueStartDecision() { throw new Error('SDD admission must not be read'); },
        get preBranchSdd() { throw new Error('SDD guard must not be reached'); },
        get ai() { throw new Error('Model configuration must not be read'); },
    } as unknown as Execution;
    return { useCase, input, readComments };
}
describe('real history command entrypoints', () => {
    beforeEach(() => forbidden.invoke.mockClear());
    it.each(['issue','pr'] as const)('routes %s without SDD admission, model, mutation, language adaptation or authorization capabilities', async kind => {
        const { useCase,input,readComments } = setup(kind); const results = await useCase.invoke(input);
        expect(results[0].id).toBe('CommentAutomation.History'); expect(readComments).toHaveBeenCalledWith(kind === 'issue' ? 42 : 75); expect(forbidden.invoke).not.toHaveBeenCalled();
    });
    it('does not read review-thread history or infer an issue from the PR number', async () => {
        const { useCase,input,readComments } = setup('pr','pull_request_review_comment');
        const result = await useCase.invoke(input); expect(JSON.stringify(result)).toContain('unsupported-surface'); expect(readComments).not.toHaveBeenCalled(); expect(forbidden.invoke).not.toHaveBeenCalled();
    });
    it.each(['/copilot history extra','/copilot history model=gpt-6-luna'])('rejects argument-bearing query %s', command => expect(parseCopilotCommand(command).kind).toBe('invalid'));
    it.each([['issue', '/copilot history extra'], ['issue', '/copilot history model=gpt-6-luna'],
        ['pr', '/copilot history extra'], ['pr', '/copilot history model=gpt-6-luna']] as const)('rejects %s invalid query %s before SDD/model composition', async (kind, command) => {
            const { useCase, input, readComments } = setup(kind, 'issue_comment', command);
            const [result] = await useCase.invoke(input);
            expect(result.success).toBe(false); expect(readComments).not.toHaveBeenCalled();
            expect(forbidden.invoke).not.toHaveBeenCalled();
        });
    it('activates no model role for a history query', () => expect(activeAgentTasks({ eventName: 'issue_comment', comment: { body: '/copilot history' } } as never, { enabledSingleAction: false } as never, 'vypbot')).toEqual([]));
});
