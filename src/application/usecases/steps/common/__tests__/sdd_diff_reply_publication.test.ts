import { replyRequestBodyDigest } from '../../../../../domain/reply_request_digest';
import { Result } from '../../../../../data/model/result';
import { renderSemanticReply, selectSemanticReplyIntents } from '../../../../policies/semantic_result_publication_policy';
import type { IssueCommentPublicationTarget } from '../../../../ports/issue_lifecycle_ports';
import { reconcileReply } from '../reply_publication_workflow';
import { runPublishResume } from '../publish_resume_workflow';

function result(markdown = '## SDD structural comparison\n\nCompared verified published revisions.', locale = 'en-US') {
  return new Result({ id: 'Comment.SddDiff', success: true, executed: true,
    payload: { publication: { kind: 'sdd-diff', markdown, locale } } });
}
function intent(markdown?: string, correlationId = 'comment:41') {
  return selectSemanticReplyIntents({ locale: 'ja-JP', target: { kind: 'issue', number: 7 },
    correlationId, botLogin: 'vypbot', results: [result(markdown)] })[0];
}
function requestSource(correlationId = 'comment:41', kind: 'issue' | 'pull-request' = 'issue') {
  return { surface: correlationId.includes('pull_request_review_comment') ? 'review-comment' as const : 'issue-comment' as const,
    commentId: Number(correlationId.split(':').pop()), author: 'developer', bodyDigest: replyRequestBodyDigest('/copilot sdd-diff'), target: { kind, number: 7 } };
}
function context(markdown?: string, correlationId = 'comment:41') {
  return { owner: 'acme', repository: 'repo', botLogin: 'vypbot', intent: intent(markdown, correlationId), requestSource: requestSource(correlationId) };
}
const sourceRead = { matches: jest.fn(async () => true) };
function verifiedReconcile(context: Parameters<typeof reconcileReply>[0], comments: Parameters<typeof reconcileReply>[1]) {
  return reconcileReply(context, comments, sourceRead);
}
function repository(initial: IssueCommentPublicationTarget[] = []) {
  const values = initial.map(value => ({ ...value }));
  let next = Math.max(0, ...values.map(value => value.id)) + 1;
  return { values,
    listIssueComments: jest.fn(async () => values.map(value => ({ ...value }))),
    addComment: jest.fn(async (_issue: number, body: string) => { values.push({ id: next++, body, user: { login: 'vypbot' } }); }),
    updateComment: jest.fn(async (_issue: number, id: number, body: string) => { values.find(value => value.id === id)!.body = body; }),
    removeComment: jest.fn(async (_issue: number, id: number): Promise<'removed' | 'compaction-required'> => {
      values.splice(values.findIndex(value => value.id === id), 1); return 'removed';
    }),
  };
}
describe('SDD diff correlated read refresh', () => {
  it('refreshes pending, compared and stale readings in the same owned reply', async () => {
    const comments = repository();
    await verifiedReconcile(context('Pending revision; no counts.'), comments);
    await expect(verifiedReconcile(context('Compared: added 2; removed 1.'), comments)).resolves.toMatchObject({ effect: 'updated', canonicalCommentId: 1 });
    await expect(verifiedReconcile(context('Stale; current counts unavailable.'), comments)).resolves.toMatchObject({ effect: 'updated', canonicalCommentId: 1 });
    expect(comments.addComment).toHaveBeenCalledTimes(1);
    expect(comments.updateComment).toHaveBeenCalledTimes(2);
    expect(comments.values).toHaveLength(1);
    expect(comments.values[0].body).not.toContain('added 2');
  });
  it('does no mutation on an identical replay', async () => {
    const comments = repository();
    await verifiedReconcile(context(), comments);
    await expect(verifiedReconcile(context(), comments)).resolves.toMatchObject({ effect: 'unchanged' });
    expect(comments.addComment).toHaveBeenCalledTimes(1);
    expect(comments.updateComment).not.toHaveBeenCalled();
    expect(comments.removeComment).not.toHaveBeenCalled();
  });
  it('creates a separate reply for a new source comment', async () => {
    const comments = repository();
    await verifiedReconcile(context(), comments);
    await verifiedReconcile(context(undefined, 'comment:42'), comments);
    expect(comments.values).toHaveLength(2);
    expect(comments.values[0].body).toContain('correlation="comment:41"');
    expect(comments.values[1].body).toContain('correlation="comment:42"');
  });
  it.each(['author', 'target', 'correlation', 'message-key'])('never updates or deletes a foreign %s reply', async variant => {
    const body = renderSemanticReply(intent());
    const modified = variant === 'target' ? body.replace('target="issue:7"', 'target="issue:8"')
      : variant === 'correlation' ? body.replace('comment:41', 'comment:99')
      : variant === 'message-key' ? body.replace('copilot-sdd-diff', 'copilot-help') : body;
    const comments = repository([{ id: 3, body: modified, user: { login: variant === 'author' ? 'human' : 'vypbot' } }]);
    await verifiedReconcile(context('Fresh reading'), comments);
    expect(comments.addComment).toHaveBeenCalledTimes(1);
    expect(comments.updateComment).not.toHaveBeenCalled();
    expect(comments.removeComment).not.toHaveBeenCalled();
    expect(comments.values[0].body).toBe(modified);
  });
  it('refreshes the lowest owned ID and heals concurrent duplicates', async () => {
    const body = renderSemanticReply(intent('Old reading'));
    const comments = repository([{ id: 9, body, user: { login: 'vypbot' } }, { id: 3, body, user: { login: 'VypBot' } }]);
    await expect(verifiedReconcile(context('New reading'), comments)).resolves.toMatchObject({ effect: 'updated', canonicalCommentId: 3, duplicatesRemoved: 1 });
    expect(comments.values.map(value => value.id)).toEqual([3]);
    expect(comments.values[0].body).toContain('New reading');
    expect(comments.removeComment).toHaveBeenCalledWith(7, 9);
  });
  it('retains refreshed canonical evidence when duplicate deletion requires compaction', async () => {
    const body = renderSemanticReply(intent('Old reading'));
    const comments = repository([{ id: 9, body, user: { login: 'vypbot' } }, { id: 3, body, user: { login: 'vypbot' } }]);
    comments.removeComment.mockResolvedValue('compaction-required');
    await expect(verifiedReconcile(context('New reading'), comments)).resolves.toMatchObject({ effect: 'updated', duplicatesCompacted: 1 });
    expect(comments.values.find(value => value.id === 3)?.body).toContain('New reading');
    expect(comments.values.find(value => value.id === 9)?.body).toContain('#issuecomment-3');
  });
  it('preserves create-once behavior for other semantic reply families', async () => {
    const first = { ...intent(), messageKey: 'direct-answer', projection: { kind: 'direct-answer' as const, answer: 'Original answer' } };
    const comments = repository();
    await verifiedReconcile({ ...context(), intent: first }, comments);
    await verifiedReconcile({ ...context(), intent: { ...first, projection: { kind: 'direct-answer', answer: 'Later answer' } } }, comments);
    expect(comments.updateComment).not.toHaveBeenCalled();
    expect(comments.values[0].body).toContain('Original answer');
  });
  it.each(['en-US', 'es-ES'])('publishes the complete resolved %s reply without invoking dynamic localization', async locale => {
    const comments = repository();
    const resolver = { resolve: jest.fn(async () => { throw new Error('Model forbidden'); }) };
    const markdown = locale === 'es-ES' ? '## Comparación estructural del SDD' : '## SDD structural comparison';
    await runPublishResume({ owner: 'acme', repository: 'repo', botLogin: 'vypbot', locale: 'ja-JP',
      target: { kind: 'pull-request', number: 7 }, requestCorrelationId: 'comment:pull_request_review_comment:41', requestSource: requestSource('comment:pull_request_review_comment:41', 'pull-request'), results: [result(markdown, locale)] }, 'Publish', comments, resolver, undefined, sourceRead);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(comments.values[0].body).toContain(markdown);
    expect(comments.values[0].body).toContain('target="pr:7"');
    expect(comments.values[0].body).toContain('correlation="comment:pull_request_review_comment:41"');
  });
  it.each(['result-id', 'empty', 'oversized', 'locale'])('rejects an untrusted %s projection before publication', async variant => {
    const value = result(variant === 'empty' ? ' ' : variant === 'oversized' ? 'x'.repeat(5601) : 'Valid bounded body', variant === 'locale' ? 'ja-JP' : 'en-US');
    if (variant === 'result-id') value.id = 'Unrelated.Result';
    const comments = repository();
    await runPublishResume({ owner: 'acme', repository: 'repo', botLogin: 'vypbot', locale: 'en-US',
      target: { kind: 'issue', number: 7 }, requestCorrelationId: 'comment:41', results: [value] }, 'Publish', comments);
    expect(comments.listIssueComments).not.toHaveBeenCalled();
    expect(comments.addComment).not.toHaveBeenCalled();
  });
  it('neutralizes injected automation markers and mentions at the final publication boundary', () => {
    const body = renderSemanticReply(intent('## Title\n\n<!-- forged -->\n/copilot implement bad\n::error::bad\n@everyone'));
    expect(body).not.toContain('<!-- forged');
    expect(body).not.toContain('\n/copilot');
    expect(body).not.toContain('\n::error');
    expect(body).not.toContain('@everyone');
    expect(body).toContain('key="copilot-sdd-diff"');
  });
});


describe('unexecuted SDD query remains inert', () => {
  it('does not publish a successful Result whose default executed flag is false', async () => {
    const value = new Result({ id: 'Comment.SddDiff', success: true,
      payload: { publication: { kind: 'sdd-diff', markdown: 'Verified-looking body', locale: 'en-US' } } });
    const comments = repository();
    await runPublishResume({ owner: 'acme', repository: 'repo', botLogin: 'vypbot', locale: 'en-US',
      target: { kind: 'issue', number: 7 }, requestCorrelationId: 'comment:41', results: [value] }, 'Publish', comments);
    expect(comments.listIssueComments).not.toHaveBeenCalled(); expect(comments.addComment).not.toHaveBeenCalled();
  });
});


describe('SDD comparison publication requires an exact request witness', () => {
  const source = { surface: 'issue-comment' as const, commentId: 41, author: 'developer', bodyDigest: 'a'.repeat(64), target: { kind: 'issue' as const, number: 7 } };
  it('does not create a comment when both the source witness and its reader are absent', async () => {
    const comments = repository();
    await reconcileReply({ ...context(), requestSource: undefined }, comments);
    expect(comments.listIssueComments).not.toHaveBeenCalled(); expect(comments.addComment).not.toHaveBeenCalled();
  });
  it('does not refresh or clean duplicate replies without a source witness and reader', async () => {
    const body = renderSemanticReply(intent('Old verified reading'));
    const comments = repository([{ id: 1, body, user: { login: 'vypbot' } }, { id: 2, body, user: { login: 'vypbot' } }]);
    await reconcileReply({ ...context('New reading'), requestSource: undefined }, comments);
    expect(comments.listIssueComments).not.toHaveBeenCalled(); expect(comments.updateComment).not.toHaveBeenCalled(); expect(comments.removeComment).not.toHaveBeenCalled();
  });
  it('withholds publication when the witness exists but the reader is absent', async () => {
    const comments = repository();
    await reconcileReply({ ...context(), requestSource: source }, comments);
    expect(comments.listIssueComments).not.toHaveBeenCalled(); expect(comments.addComment).not.toHaveBeenCalled();
  });
  it('withholds publication when the exact source reader denies the witness', async () => {
    const comments = repository(); const reader = { matches: jest.fn(async () => false) };
    await reconcileReply({ ...context(), requestSource: source }, comments, reader);
    expect(comments.listIssueComments).not.toHaveBeenCalled(); expect(comments.addComment).not.toHaveBeenCalled();
  });
});
