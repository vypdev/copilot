import { selectSemanticReplyIntents } from '../../policies/semantic_result_publication_policy';
import { PublishResultUseCase } from '../steps/common/publish_resume_use_case';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
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


describe('PR main conversation history routing', () => {
    beforeEach(() => forbidden.invoke.mockClear());
    function mainPr() {
        const f = setup('issue');
        Object.assign(f.input, { isPullRequest: true, issueNumber: 42, issue: { number: 75, commentId: 100, commentBody: '/copilot history' } });
        return f;
    }
    it('selects the verified PR target instead of its linked issue or issue-shaped event payload', async () => {
        const f = mainPr(); const results = await f.useCase.invoke(f.input);
        expect(f.readComments).toHaveBeenCalledWith(75);
        expect(results[0].payload).toMatchObject({ publication: { target: { kind: 'pr', number: 75 } } });
        expect(selectSemanticReplyIntents({ locale: 'en-US', target: { kind: 'pull-request', number: 75 },
            correlationId: 'comment:100', results })).toHaveLength(1);
        expect(forbidden.invoke).not.toHaveBeenCalled();
    });
    it('publishes the route result through the real verified-source reply boundary in the PR conversation', async () => {
        const f = mainPr(), results = await f.useCase.invoke(f.input);
        const stored: Array<{ id: number; body: string; user: { login: string } }> = [];
        const comments = { listIssueComments: jest.fn(async () => stored),
            addComment: jest.fn(async (_number: number, body: string) => { stored.push({ id: 101, body, user: { login: 'vypbot' } }); }),
            updateComment: jest.fn(async () => undefined), removeComment: jest.fn(async () => 'removed' as const) };
        const target = { kind: 'pull-request' as const, number: 75 };
        await new PublishResultUseCase(comments, undefined, undefined, { matches: async () => true }).invoke({
            owner: 'acme', repository: 'widget', botLogin: 'vypbot', locale: 'en-US', target,
            requestCorrelationId: 'comment:100', results, requestSource: { surface: 'issue-comment', commentId: 100,
                author: 'developer', target, bodyDigest: replyRequestBodyDigest('/copilot history') },
        });
        expect(comments.addComment).toHaveBeenCalledWith(75, expect.stringContaining('target="pr:75"'));
        expect(stored).toHaveLength(1); expect(stored[0].body).toContain('## Operation history');
        expect(forbidden.invoke).not.toHaveBeenCalled();
    });
});


it('withholds PR history reads when no authoritative bot identity is available', async () => {
    const f = setup('issue');
    Object.assign(f.input, { isPullRequest: true, tokenUser: undefined, issue: { number: 75, commentId: 100, commentBody: '/copilot history' } });
    const [result] = await f.useCase.invoke(f.input);
    expect(f.readComments).not.toHaveBeenCalled();
    expect(result.payload).toMatchObject({ publication: { target: { kind: 'pr', number: 75 }, state: 'unavailable' } });
    expect(forbidden.invoke).not.toHaveBeenCalled();
});
