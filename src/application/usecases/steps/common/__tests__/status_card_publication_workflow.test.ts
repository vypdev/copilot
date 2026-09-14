import { reconcileStatusCard } from '../status_card_publication_workflow';
import { renderSemanticStatus, selectSemanticStatusIntents } from '../../../../policies/semantic_result_publication_policy';
import { Result } from '../../../../../data/model/result';

function intent(summary = 'Current') {
  return selectSemanticStatusIntents({
    locale: 'en-US',
    results: [new Result({ id: 'CheckProgressUseCase', success: true, executed: true, payload: { issueNumber: 7, progress: 50, summary } })],
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

const context = (value = intent()) => ({ owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: value });

describe('status card publication workflow', () => {
  it('creates and discovers one canonical card', async () => {
    const repository = ports();
    await expect(reconcileStatusCard(context(), repository)).resolves.toEqual({ effect: 'created', canonicalCommentId: 1, duplicatesCompacted: 0 });
    expect(repository.addComment).toHaveBeenCalledTimes(1);
    expect(repository.updateComment).not.toHaveBeenCalled();
  });

  it('updates a changed canonical card and skips an unchanged one', async () => {
    const first = intent('Old');
    const repository = ports([{ id: 3, body: renderSemanticStatus(first), user: { login: 'VypBot' } }]);
    const changed = intent('New');

    await expect(reconcileStatusCard(context(changed), repository)).resolves.toMatchObject({ effect: 'updated', canonicalCommentId: 3 });
    repository.updateComment.mockClear();
    await expect(reconcileStatusCard(context(changed), repository)).resolves.toMatchObject({ effect: 'unchanged' });
    expect(repository.updateComment).not.toHaveBeenCalled();
  });

  it('ignores human, third-party, malformed, and different-identity comments', async () => {
    const value = intent();
    const body = renderSemanticStatus(value);
    const repository = ports([
      { id: 1, body, user: { login: 'human' } },
      { id: 2, body: 'not a marker', user: { login: 'vypbot' } },
      { id: 3, body: body.replace('key="work"', 'key="other"'), user: { login: 'vypbot' } },
    ]);

    await reconcileStatusCard(context(value), repository);

    expect(repository.addComment).toHaveBeenCalledTimes(1);
    expect(repository.comments).toHaveLength(4);
  });

  it('keeps the lowest bot-owned id and compacts concurrent duplicates', async () => {
    const value = intent('Latest');
    const stale = renderSemanticStatus(intent('Stale'));
    const repository = ports([
      { id: 9, body: renderSemanticStatus(value), user: { login: 'vypbot' } },
      { id: 4, body: stale, user: { login: 'vypbot' } },
    ]);

    await expect(reconcileStatusCard(context(value), repository)).resolves.toEqual({
      effect: 'updated', canonicalCommentId: 4, duplicatesCompacted: 1,
    });
    expect(repository.comments.find(comment => comment.id === 4)?.body).toContain('Latest');
    expect(repository.comments.find(comment => comment.id === 9)?.body).toContain('copilot:publication-duplicate');
    expect(repository.comments.find(comment => comment.id === 9)?.body).toContain('/issues/7#issuecomment-4');
  });

  it('fails closed without a trusted bot identity', async () => {
    const repository = ports();
    await expect(reconcileStatusCard({ ...context(), botLogin: '' }, repository)).resolves.toEqual({
      effect: 'unchanged', duplicatesCompacted: 0,
    });
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });

  it('tolerates create visibility lag without guessing a comment id', async () => {
    const repository = ports();
    repository.addComment.mockImplementation(async () => undefined);
    await expect(reconcileStatusCard(context(), repository)).resolves.toEqual({ effect: 'created', duplicatesCompacted: 0 });
  });
});
