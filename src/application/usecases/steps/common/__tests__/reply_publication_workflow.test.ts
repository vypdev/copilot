import { Result } from '../../../../../data/model/result';
import { selectSemanticReplyIntents } from '../../../../policies/semantic_result_publication_policy';
import { reconcileReply } from '../reply_publication_workflow';

function intent() {
  return selectSemanticReplyIntents({
    locale: 'en-US', target: { kind: 'issue', number: 7 }, correlationId: 'comment:41', botLogin: 'vypbot',
    results: [new Result({
      id: 'Comment.Help', success: true, executed: true,
      payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
    })],
  })[0];
}

function directAnswerIntent() {
  return selectSemanticReplyIntents({
    locale: 'de-DE', target: { kind: 'issue', number: 7 }, correlationId: 'event:abc12345',
    results: [new Result({
      id: 'AnswerIssueHelpUseCase', success: true, executed: true,
      payload: { publication: { kind: 'direct-answer', answer: 'Die Antwort.' } },
    })],
  })[0];
}

function ports(initial: Array<{ id: number; body: string | null; user?: { login?: string } }> = []) {
  const comments = initial.map(value => ({ ...value }));
  let next = Math.max(0, ...comments.map(comment => comment.id)) + 1;
  return {
    comments,
    listIssueComments: jest.fn(async () => comments.map(comment => ({ ...comment }))),
    addComment: jest.fn(async (_issue: number, body: string) => { comments.push({ id: next++, body, user: { login: 'vypbot' } }); }),
    updateComment: jest.fn(async (_issue: number, id: number, body: string) => {
      const comment = comments.find(value => value.id === id);
      if (comment) comment.body = body;
    }),
    removeComment: jest.fn(async (_issue: number, id: number): Promise<'removed' | 'compaction-required'> => {
      const index = comments.findIndex(value => value.id === id);
      if (index >= 0) comments.splice(index, 1);
      return 'removed';
    }),
  };
}

const context = () => ({ owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: intent() });

describe('reply publication workflow', () => {
  it('creates a reply once and treats an event replay as unchanged', async () => {
    const repository = ports();
    await expect(reconcileReply(context(), repository)).resolves.toMatchObject({ effect: 'created', canonicalCommentId: 1 });
    await expect(reconcileReply(context(), repository)).resolves.toMatchObject({ effect: 'unchanged', canonicalCommentId: 1 });
    expect(repository.addComment).toHaveBeenCalledTimes(1);
  });

  it('publishes an initial help answer once through the correlated reply boundary', async () => {
    const repository = ports();
    const directContext = { ...context(), intent: directAnswerIntent() };

    await expect(reconcileReply(directContext, repository)).resolves.toMatchObject({
      effect: 'created', canonicalCommentId: 1,
    });
    await expect(reconcileReply(directContext, repository)).resolves.toMatchObject({
      effect: 'unchanged', canonicalCommentId: 1,
    });
    expect(repository.addComment).toHaveBeenCalledTimes(1);
    expect(repository.comments[0].body).toContain('Die Antwort.');
    expect(repository.comments[0].body).toContain('key="direct-answer"');
  });

  it('ignores a forged marker written by a different user', async () => {
    const original = ports();
    await reconcileReply(context(), original);
    const forged = ports([{ id: 4, body: original.comments[0].body, user: { login: 'human' } }]);
    await reconcileReply(context(), forged);
    expect(forged.addComment).toHaveBeenCalledTimes(1);
    expect(forged.removeComment).not.toHaveBeenCalled();
  });

  it('removes concurrent bot-owned duplicates and keeps the lowest id', async () => {
    const seeded = ports();
    await reconcileReply(context(), seeded);
    const body = seeded.comments[0].body;
    const repository = ports([
      { id: 9, body, user: { login: 'vypbot' } },
      { id: 3, body, user: { login: 'VypBot' } },
    ]);

    await expect(reconcileReply(context(), repository)).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 3,
      duplicatesRemoved: 1, duplicatesCompacted: 0, compactedCommentIds: [],
    });
    expect(repository.comments.map(comment => comment.id)).toEqual([3]);
    expect(repository.removeComment).toHaveBeenCalledWith(7, 9);
  });

  it('treats a removed correlation namespace as inert', async () => {
    const seeded = ports();
    await reconcileReply(context(), seeded);
    const currentBody = seeded.comments[0].body as string;
    const namespacedBody = currentBody.replace(
      'correlation="comment:41"',
      'correlation="comment:issue_comment:41"',
    );
    const repository = ports([
      { id: 8, body: currentBody, user: { login: 'vypbot' } },
      { id: 3, body: namespacedBody, user: { login: 'vypbot' } },
    ]);

    await expect(reconcileReply(context(), repository)).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 8,
      duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: [],
    });
    expect(repository.addComment).not.toHaveBeenCalled();
    expect(repository.removeComment).not.toHaveBeenCalled();
    expect(repository.comments.map(comment => comment.id)).toEqual([8, 3]);
  });

  it('does no provider work without a trusted bot identity', async () => {
    const repository = ports();
    await expect(reconcileReply({ ...context(), botLogin: '' }, repository)).resolves.toEqual({
      effect: 'unchanged', duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: [],
    });
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });

  it('tolerates create visibility lag without guessing a reply id', async () => {
    const repository = ports();
    repository.addComment.mockImplementation(async () => undefined);
    await expect(reconcileReply(context(), repository)).resolves.toEqual({
      effect: 'created', duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: [],
    });
  });

  it('links a compacted pull-request reply to the canonical PR comment', async () => {
    const value = { ...intent(), target: { kind: 'pull-request' as const, number: 9 }, locale: 'es-ES' };
    const seeded = ports();
    await reconcileReply({ ...context(), intent: value }, seeded);
    const repository = ports([
      { id: 7, body: seeded.comments[0].body, user: { login: 'vypbot' } },
      { id: 4, body: seeded.comments[0].body, user: { login: 'vypbot' } },
    ]);
    repository.removeComment.mockResolvedValue('compaction-required');

    await expect(reconcileReply({ ...context(), intent: value }, repository)).resolves.toMatchObject({
      duplicatesRemoved: 0, duplicatesCompacted: 1, compactedCommentIds: [7],
    });
    expect(repository.comments.find(comment => comment.id === 7)?.body).toContain('/pull/9#issuecomment-4');
    expect(repository.comments.find(comment => comment.id === 7)?.body).toContain('respuesta duplicada');

    await reconcileReply({ ...context(), intent: value }, repository);
    expect(repository.removeComment).toHaveBeenCalledTimes(1);
    expect(repository.updateComment).toHaveBeenCalledTimes(1);
  });
});
