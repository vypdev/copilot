import { Result } from '../../../../../data/model/result';
import { ApplicationError } from '../../../../errors/application_error';
import { selectSemanticReplyIntents, renderSemanticReply } from '../../../../policies/semantic_result_publication_policy';
import { replyRequestBodyDigest } from '../../../../../domain/reply_request_digest';
import { reconcileReply } from '../reply_publication_workflow';
import { projectPublishResultContext } from '../publish_resume_workflow';
const oldError = new ApplicationError('validation.invalid-input', 'Private parser detail');
const currentError = new ApplicationError('workflow.failed', 'Private path', { retryable: false,
    recovery: { id: 'workspace-changes-rejected', variables: {} } });
function intent(error = currentError) {
    return selectSemanticReplyIntents({ locale: 'en-US', target: { kind: 'pull-request', number: 7 },
        correlationId: 'comment:41', results: [new Result({ id: 'Fix', success: false, executed: true, errors: [error] })] })[0];
}
function fixture() {
    const comments = [{ id: 100, body: renderSemanticReply(intent(oldError)), user: { login: 'vypbot' } }];
    const port = { listIssueComments: jest.fn(async () => comments.map(c => ({ ...c }))),
        addComment: jest.fn(async (_number: number, body: string) => { comments.push({ id: 101, body, user: { login: 'vypbot' } }); }),
        updateComment: jest.fn(async (_number: number, id: number, body: string) => { comments.find(c => c.id === id)!.body = body; }),
        removeComment: jest.fn(async () => 'removed' as const) };
    const source = { surface: 'issue-comment' as const, commentId: 41, author: 'developer', bodyDigest: replyRequestBodyDigest('/copilot fix "finding:42"'),
        target: { kind: 'pull-request' as const, number: 7 } };
    const read = { matches: jest.fn(async () => true) };
    const context = { owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: intent(), requestSource: source };
    return { comments, port, source, read, context };
}
describe('current request error and query refresh', () => {
    it('replaces the prior input error with the verified current postflight result in the same reply', async () => {
        const f = fixture(); await expect(reconcileReply(f.context, f.port, f.read)).resolves.toMatchObject({ effect: 'updated', canonicalCommentId: 100 });
        expect(f.comments[0].body).toContain('workflow.failed'); expect(f.comments[0].body).toContain('workspace verification');
        expect(f.comments[0].body).not.toContain('validation.invalid-input'); expect(f.comments[0].body).not.toContain('Private');
        expect(f.port.addComment).not.toHaveBeenCalled(); expect(f.read.matches.mock.calls.length).toBeGreaterThan(1);
    });
    it('replays identical current output without another edit or comment', async () => {
        const f = fixture(); await reconcileReply(f.context, f.port, f.read); f.port.updateComment.mockClear();
        await expect(reconcileReply(f.context, f.port, f.read)).resolves.toMatchObject({ effect: 'unchanged' });
        expect(f.port.updateComment).not.toHaveBeenCalled(); expect(f.port.addComment).not.toHaveBeenCalled();
    });
    it('does not edit or clean up an old response when the current request cannot be verified', async () => {
        const f = fixture(); f.comments.push({ ...f.comments[0], id: 102 }); f.read.matches.mockResolvedValue(false);
        await expect(reconcileReply(f.context, f.port, f.read)).resolves.toMatchObject({ effect: 'unchanged' });
        expect(f.port.updateComment).not.toHaveBeenCalled(); expect(f.port.removeComment).not.toHaveBeenCalled();
    });
    it('withholds the edit when the source changes immediately before publication', async () => {
        const f = fixture(); f.read.matches.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await reconcileReply(f.context, f.port, f.read); expect(f.port.updateComment).not.toHaveBeenCalled();
    });
    it('does not create an obsolete response if the source changes after collection', async () => {
        const f = fixture(); f.comments.length = 0; f.read.matches.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await reconcileReply(f.context, f.port, f.read); expect(f.port.addComment).not.toHaveBeenCalled();
    });
    it('retains an already created reply fact if the source subsequently moves', async () => {
        const f = fixture(); f.comments.length = 0;
        f.read.matches.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await expect(reconcileReply(f.context, f.port, f.read)).resolves.toMatchObject({ effect: 'created', canonicalCommentId: 101 });
    });
    it('does not infer freshness from a different target or transport', async () => {
        const f = fixture(); await reconcileReply({ ...f.context, requestSource: { ...f.source, target: { kind: 'pull-request', number: 8 } } }, f.port, f.read);
        await reconcileReply({ ...f.context, requestSource: { ...f.source, surface: 'review-comment' } }, f.port, f.read);
        expect(f.read.matches).not.toHaveBeenCalled(); expect(f.port.updateComment).not.toHaveBeenCalled();
    });
    it('keeps the old reply immutable when no authoritative source reader is bound', async () => {
        const f = fixture(); await reconcileReply(f.context, f.port); expect(f.port.updateComment).not.toHaveBeenCalled();
    });
    it('keeps the event witness frozen across asynchronous reads without mutable aliases', async () => {
        const f = fixture(), original = f.source.bodyDigest;
        const read = { matches: jest.fn(async (witness: typeof f.source) => {
            f.source.bodyDigest = 'f'.repeat(64); expect(witness.bodyDigest).toBe(original);
            expect(Object.isFrozen(witness)).toBe(true); expect(Object.isFrozen(witness.target)).toBe(true); return true;
        }) };
        await reconcileReply(f.context, f.port, read); expect(f.port.updateComment).toHaveBeenCalledTimes(1);
    });
    it('refreshes a read-only help view for the verified request without multiplying replies', async () => {
        const f = fixture();
        const help = (locale: string) => selectSemanticReplyIntents({ locale, target: f.context.intent.target, correlationId: 'comment:41',
            results: [new Result({ id: 'Comment.Help', success: true, executed: true, payload: { publication: { kind: 'help', botLogin: 'vypbot' } } })] })[0];
        f.comments[0].body = renderSemanticReply(help('en-US'));
        await expect(reconcileReply({ ...f.context, intent: help('es-ES') }, f.port, f.read)).resolves.toMatchObject({ effect: 'updated' });
        expect(f.port.addComment).not.toHaveBeenCalled();
    });
    it('verifies the source before retaining a mutation receipt without rewriting it', async () => {
        const f = fixture(); const receipt = selectSemanticReplyIntents({ locale: 'en-US', target: f.context.intent.target, correlationId: 'comment:41',
            results: [new Result({ id: 'CommentAutomation.StateCommandReply', success: true, executed: true,
                payload: { publication: { kind: 'state-command-result', command: 'dismiss', outcome: 'completed', count: 1 } } })] })[0];
        expect(receipt).toBeDefined(); f.comments[0].body = renderSemanticReply(receipt);
        await reconcileReply({ ...f.context, intent: receipt }, f.port, f.read);
        expect(f.read.matches).toHaveBeenCalled(); expect(f.port.updateComment).not.toHaveBeenCalled();
    });
    it('withholds a new mutation receipt when its source no longer matches', async () => {
        const f = fixture(); f.comments.length = 0; f.read.matches.mockResolvedValue(false);
        const receipt = selectSemanticReplyIntents({ locale: 'en-US', target: f.context.intent.target, correlationId: 'comment:41',
            results: [new Result({ id: 'CommentAutomation.StateCommandReply', success: true, executed: true,
                payload: { publication: { kind: 'state-command-result', command: 'dismiss', outcome: 'completed', count: 1 } } })] })[0];
        await reconcileReply({ ...f.context, intent: receipt }, f.port, f.read);
        expect(f.read.matches).toHaveBeenCalled(); expect(f.port.addComment).not.toHaveBeenCalled();
    });
});

describe('event request witness projection', () => {
    function source(eventName = 'issue_comment') {
        return { owner: 'acme', repo: 'widgets', tokenUser: 'vypbot', eventName, isPullRequest: true, pullRequest: { number: 7 },
            locale: { issue: 'en-US', pullRequest: 'en-US' }, currentConfiguration: { results: [] },
            inputs: { comment: { id: 41, body: '/copilot status', user: { login: 'developer' } } } };
    }
    it('captures a complete private witness without request prose in the published context', () => {
        const s = source(), result = projectPublishResultContext(s); s.inputs.comment.body = 'changed';
        expect(result.requestSource).toMatchObject({ commentId: 41, surface: 'issue-comment', bodyDigest: replyRequestBodyDigest('/copilot status') });
        expect(JSON.stringify(result.requestSource)).not.toContain('/copilot'); expect(Object.isFrozen(result.requestSource)).toBe(true);
    });
    it('keeps the real SDK review-comment payload in its separate namespace', () => {
        expect(projectPublishResultContext(source('pull_request_review_comment'))).toMatchObject({ requestCorrelationId: 'comment:pull_request_review_comment:41',
            requestSource: { surface: 'review-comment', commentId: 41 } });
    });
    it.each(['wrong event', 'missing target', 'missing source', 'non-text body', 'overlong body', 'missing author', 'invalid id'])('withholds %s without an inferred witness', scenario => {
        const s = source();
        if (scenario === 'wrong event') s.eventName = 'push';
        if (scenario === 'missing target') s.pullRequest.number = 0;
        if (scenario === 'missing source') s.inputs.comment = undefined as never;
        if (scenario === 'non-text body') s.inputs.comment.body = null as never;
        if (scenario === 'overlong body') s.inputs.comment.body = 'x'.repeat(70_001);
        if (scenario === 'missing author') s.inputs.comment.user.login = '';
        if (scenario === 'invalid id') s.inputs.comment.id = 0;
        expect(projectPublishResultContext(s).requestSource).toBeUndefined();
    });
});
