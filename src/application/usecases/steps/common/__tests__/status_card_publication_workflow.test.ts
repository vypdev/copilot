import { reconcileStatusCard } from '../status_card_publication_workflow';
import { renderSemanticStatus, selectSemanticStatusIntents } from '../../../../policies/semantic_result_publication_policy';
import { Result } from '../../../../../data/model/result';

const SOURCE_HEAD = 'a'.repeat(40);
const NEWER_HEAD = 'b'.repeat(40);

function intent(summary = 'Current') {
  return selectSemanticStatusIntents({
    locale: 'en-US',
    results: [new Result({
      id: 'CheckProgressUseCase', success: true, executed: true,
      payload: { issueNumber: 7, progress: 50, summary, branch: 'feature/work', sourceHeadSha: SOURCE_HEAD },
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

const context = (value = intent()) => ({ owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: value });
const currentSource = (...heads: string[]) => {
  const remaining = [...heads];
  return { getBranchHeadSha: jest.fn(async () => remaining.shift() ?? SOURCE_HEAD) };
};

describe('status card publication workflow', () => {
  it('creates and discovers one canonical card', async () => {
    const repository = ports();
    await expect(reconcileStatusCard(context(), repository, currentSource())).resolves.toEqual({ effect: 'created', canonicalCommentId: 1, duplicatesCompacted: 0 });
    expect(repository.addComment).toHaveBeenCalledTimes(1);
    expect(repository.updateComment).not.toHaveBeenCalled();
  });

  it('updates a changed canonical card and skips an unchanged one', async () => {
    const first = intent('Old');
    const repository = ports([{ id: 3, body: renderSemanticStatus(first), user: { login: 'VypBot' } }]);
    const changed = intent('New');

    await expect(reconcileStatusCard(context(changed), repository, currentSource())).resolves.toMatchObject({ effect: 'updated', canonicalCommentId: 3 });
    repository.updateComment.mockClear();
    await expect(reconcileStatusCard(context(changed), repository, currentSource())).resolves.toMatchObject({ effect: 'unchanged' });
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

    await reconcileStatusCard(context(value), repository, currentSource());

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

    await expect(reconcileStatusCard(context(value), repository, currentSource())).resolves.toEqual({
      effect: 'updated', canonicalCommentId: 4, duplicatesCompacted: 1,
    });
    expect(repository.comments.find(comment => comment.id === 4)?.body).toContain('Latest');
    expect(repository.comments.find(comment => comment.id === 9)?.body).toContain('copilot:publication-duplicate');
    expect(repository.comments.find(comment => comment.id === 9)?.body).toContain('/issues/7#issuecomment-4');
  });

  it('fails closed without a trusted bot identity', async () => {
    const repository = ports();
    await expect(reconcileStatusCard({ ...context(), botLogin: '' }, repository, currentSource())).resolves.toEqual({
      effect: 'unchanged', duplicatesCompacted: 0,
    });
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });

  it('tolerates create visibility lag without guessing a comment id', async () => {
    const repository = ports();
    repository.addComment.mockImplementation(async () => undefined);
    await expect(reconcileStatusCard(context(), repository, currentSource())).resolves.toEqual({ effect: 'created', duplicatesCompacted: 0 });
  });

  it('preserves the created outcome when post-create discovery finds a stale canonical card', async () => {
    const value = intent('Latest');
    const repository = ports([{ id: 1, body: renderSemanticStatus(intent('Stale')), user: { login: 'vypbot' } }]);
    let reads = 0;
    repository.listIssueComments.mockImplementation(async () => {
      reads += 1;
      return reads === 1 ? [] : repository.comments.map(comment => ({ ...comment }));
    });

    await expect(reconcileStatusCard(context(value), repository, currentSource())).resolves.toMatchObject({
      effect: 'created', canonicalCommentId: 1,
    });
    expect(repository.comments[0].body).toContain('Latest');
  });

  it('links compacted pull-request cards to the canonical PR comment', async () => {
    const value = {
      ...intent('Latest'),
      identity: { ...intent('Latest').identity, target: { kind: 'pull-request' as const, number: 9 } },
      locale: 'es-ES',
    };
    const body = renderSemanticStatus(value);
    const repository = ports([
      { id: 7, body, user: { login: 'vypbot' } },
      { id: 4, body, user: { login: 'vypbot' } },
    ]);

    await reconcileStatusCard(context(value), repository, currentSource());
    expect(repository.comments.find(comment => comment.id === 7)?.body).toContain('/pull/9#issuecomment-4');
    expect(repository.comments.find(comment => comment.id === 7)?.body).toContain('tarjeta canónica');
  });

  it('omits every read and mutation when the analyzed branch head is already stale', async () => {
    const repository = ports();
    const source = currentSource(NEWER_HEAD);

    await expect(reconcileStatusCard(context(), repository, source)).resolves.toEqual({
      effect: 'unchanged', duplicatesCompacted: 0, reason: 'stale-source',
    });

    expect(source.getBranchHeadSha).toHaveBeenCalledWith('feature/work');
    expect(repository.listIssueComments).not.toHaveBeenCalled();
    expect(repository.addComment).not.toHaveBeenCalled();
    expect(repository.updateComment).not.toHaveBeenCalled();
  });

  it('revalidates immediately before creating a missing card', async () => {
    const repository = ports();

    await expect(reconcileStatusCard(
      context(), repository, currentSource(SOURCE_HEAD, NEWER_HEAD),
    )).resolves.toEqual({ effect: 'unchanged', duplicatesCompacted: 0, reason: 'stale-source' });

    expect(repository.listIssueComments).toHaveBeenCalledTimes(1);
    expect(repository.addComment).not.toHaveBeenCalled();
  });

  it('revalidates immediately before updating an existing card', async () => {
    const repository = ports([{
      id: 3, body: renderSemanticStatus(intent('Old')), user: { login: 'vypbot' },
    }]);

    await expect(reconcileStatusCard(
      context(intent('New')), repository, currentSource(SOURCE_HEAD, NEWER_HEAD),
    )).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 3, duplicatesCompacted: 0, reason: 'stale-source',
    });

    expect(repository.updateComment).not.toHaveBeenCalled();
    expect(repository.comments[0].body).toContain('Old');
  });

  it('stops duplicate compaction if the branch advances between mutations', async () => {
    const value = intent('Current');
    const body = renderSemanticStatus(value);
    const repository = ports([
      { id: 2, body, user: { login: 'vypbot' } },
      { id: 3, body, user: { login: 'vypbot' } },
      { id: 4, body, user: { login: 'vypbot' } },
    ]);

    await expect(reconcileStatusCard(
      context(value), repository, currentSource(SOURCE_HEAD, SOURCE_HEAD, NEWER_HEAD),
    )).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 2, duplicatesCompacted: 1, reason: 'stale-source',
    });

    expect(repository.updateComment).toHaveBeenCalledTimes(1);
    expect(repository.comments[1].body).toContain('copilot:publication-duplicate');
    expect(repository.comments[2].body).toBe(body);
  });

  it('fails closed when a commit-derived card has no authoritative source port', async () => {
    const repository = ports();

    await expect(reconcileStatusCard(context(), repository)).rejects.toMatchObject({
      code: 'configuration.unsupported',
    });
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });

  it('requires exact canonical object-id equality', async () => {
    const repository = ports();

    await expect(reconcileStatusCard(
      context(), repository, currentSource(SOURCE_HEAD.toUpperCase()),
    )).resolves.toMatchObject({ reason: 'stale-source' });
    expect(repository.addComment).not.toHaveBeenCalled();
  });

  it('does not query a branch head for a non-commit-derived plan card', async () => {
    const [plan] = selectSemanticStatusIntents({
      locale: 'en-US',
      results: [new Result({
        id: 'RecommendStepsUseCase', success: true, executed: true,
        payload: { issueNumber: 7, recommendedSteps: '1. Implement' },
      })],
    });
    const repository = ports();
    const source = currentSource(NEWER_HEAD);

    await expect(reconcileStatusCard(context(plan), repository, source)).resolves.toMatchObject({ effect: 'created' });
    expect(source.getBranchHeadSha).not.toHaveBeenCalled();
  });
});
