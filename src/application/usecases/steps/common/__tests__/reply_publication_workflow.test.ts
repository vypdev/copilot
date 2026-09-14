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

  it('ignores a forged marker written by a different user', async () => {
    const original = ports();
    await reconcileReply(context(), original);
    const forged = ports([{ id: 4, body: original.comments[0].body, user: { login: 'human' } }]);
    await reconcileReply(context(), forged);
    expect(forged.addComment).toHaveBeenCalledTimes(1);
  });

  it('compacts concurrent bot-owned duplicates and keeps the lowest id', async () => {
    const seeded = ports();
    await reconcileReply(context(), seeded);
    const body = seeded.comments[0].body;
    const repository = ports([
      { id: 9, body, user: { login: 'vypbot' } },
      { id: 3, body, user: { login: 'VypBot' } },
    ]);

    await expect(reconcileReply(context(), repository)).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 3, duplicatesCompacted: 1,
    });
    expect(repository.comments.find(comment => comment.id === 9)?.body).toContain('/issues/7#issuecomment-3');
  });

  it('does no provider work without a trusted bot identity', async () => {
    const repository = ports();
    await expect(reconcileReply({ ...context(), botLogin: '' }, repository)).resolves.toEqual({
      effect: 'unchanged', duplicatesCompacted: 0,
    });
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });
});
