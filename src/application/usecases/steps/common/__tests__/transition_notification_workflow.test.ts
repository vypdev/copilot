import {
  MAX_TRANSITION_NOTIFICATION_CHARACTERS,
  reconcileTransitionNotification,
  renderTransitionNotification,
} from '../transition_notification_workflow';
import type { TransitionPublicationIntent } from '../../../../../domain/github_publication';

function intent(overrides: Partial<TransitionPublicationIntent> = {}): TransitionPublicationIntent {
  return {
    kind: 'transition',
    identity: { topic: 'branch-sync', target: { kind: 'issue', number: 7 }, key: 'develop:feature-7' },
    fingerprint: '0123abcd',
    messageKey: 'branch-sync-action-required',
    locale: 'en-US',
    values: {},
    ...overrides,
  };
}

function ports(initial: Array<{ id: number; body: string | null; user?: { login?: string } }> = []) {
  const comments = initial.map(value => ({ ...value }));
  let next = Math.max(0, ...comments.map(comment => comment.id)) + 1;
  return {
    comments,
    listIssueComments: jest.fn(async () => comments.map(comment => ({ ...comment }))),
    addComment: jest.fn(async (_issue: number, body: string) => {
      comments.push({ id: next++, body, user: { login: 'vypbot' } });
    }),
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

const message = 'Branch synchronization needs attention. [Open the current status](https://github.com/acme/widgets/issues/7#issuecomment-4).';
const context = (value = intent()) => ({
  owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: value, message,
  duplicatePointer: (url: string) => `This duplicate notification was suppressed. [View the original notification](${url}).`,
});

describe('transition notification workflow', () => {
  it('creates and discovers one canonical notification', async () => {
    const repository = ports();

    await expect(reconcileTransitionNotification(context(), repository)).resolves.toEqual({
      effect: 'created', canonicalCommentId: 1,
      duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: [],
    });
    expect(repository.addComment).toHaveBeenCalledTimes(1);
    expect(repository.comments[0].body).toContain('copilot:transition');
    expect(repository.comments[0].body).toContain(message);
  });

  it('reuses the same fingerprint without rewriting immutable notification copy', async () => {
    const value = intent();
    const repository = ports([{
      id: 4, body: renderTransitionNotification(value, message), user: { login: 'VypBot' },
    }]);

    await expect(reconcileTransitionNotification({ ...context(value), message: 'New renderer copy.' }, repository))
      .resolves.toMatchObject({ effect: 'unchanged', canonicalCommentId: 4 });
    expect(repository.addComment).not.toHaveBeenCalled();
    expect(repository.updateComment).not.toHaveBeenCalled();
    expect(repository.comments[0].body).toContain(message);
  });

  it('creates a notification for a new fingerprint', async () => {
    const previous = intent();
    const current = intent({ fingerprint: '89abcdef' });
    const repository = ports([{
      id: 4, body: renderTransitionNotification(previous, message), user: { login: 'vypbot' },
    }]);

    await expect(reconcileTransitionNotification(context(current), repository)).resolves.toMatchObject({
      effect: 'created', canonicalCommentId: 5,
    });
    expect(repository.comments).toHaveLength(2);
  });

  it('ignores forged, third-party, malformed, and different-identity markers', async () => {
    const value = intent();
    const body = renderTransitionNotification(value, message);
    const repository = ports([
      { id: 1, body, user: { login: 'human' } },
      { id: 2, body: 'not a marker', user: { login: 'vypbot' } },
      { id: 3, body: body.replace('key="develop:feature-7"', 'key="other"'), user: { login: 'vypbot' } },
      { id: 4, body },
    ]);

    await reconcileTransitionNotification(context(value), repository);

    expect(repository.addComment).toHaveBeenCalledTimes(1);
    expect(repository.removeComment).not.toHaveBeenCalled();
  });

  it('keeps the lowest exact bot-owned id and removes later concurrent duplicates', async () => {
    const body = renderTransitionNotification(intent(), message);
    const repository = ports([
      { id: 9, body, user: { login: 'vypbot' } },
      { id: 4, body: body.replace('message="branch-sync-action-required"', 'message="renamed-renderer"'), user: { login: 'vypbot' } },
    ]);

    await expect(reconcileTransitionNotification(context(), repository)).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 4,
      duplicatesRemoved: 1, duplicatesCompacted: 0, compactedCommentIds: [],
    });
    expect(repository.removeComment).toHaveBeenCalledWith(7, 9);
    expect(repository.comments.map(comment => comment.id)).toEqual([4]);
  });

  it('compacts a duplicate when deletion is explicitly forbidden', async () => {
    const value = intent({ identity: { topic: 'branch-sync', target: { kind: 'pull-request', number: 8 }, key: 'develop:feature-8' } });
    const body = renderTransitionNotification(value, message);
    const repository = ports([
      { id: 3, body, user: { login: 'vypbot' } },
      { id: 6, body, user: { login: 'vypbot' } },
    ]);
    repository.removeComment.mockResolvedValue('compaction-required');

    await expect(reconcileTransitionNotification(context(value), repository)).resolves.toEqual({
      effect: 'unchanged', canonicalCommentId: 3,
      duplicatesRemoved: 0, duplicatesCompacted: 1, compactedCommentIds: [6],
    });
    expect(repository.comments[1].body).toContain('copilot:publication-duplicate');
    expect(repository.comments[1].body).toContain('/pull/8#issuecomment-3');

    await reconcileTransitionNotification(context(value), repository);
    expect(repository.removeComment).toHaveBeenCalledTimes(1);
  });

  it('fails closed without a trusted bot identity', async () => {
    const repository = ports();

    await expect(reconcileTransitionNotification({ ...context(), botLogin: ' ' }, repository)).resolves.toEqual({
      effect: 'unchanged', duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: [],
    });
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });

  it('tolerates create visibility lag without inventing a comment id', async () => {
    const repository = ports();
    repository.addComment.mockImplementation(async () => undefined);

    await expect(reconcileTransitionNotification(context(), repository)).resolves.toEqual({
      effect: 'created', duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: [],
    });
  });

  it.each([
    ['', 'must not be empty'],
    ['x'.repeat(MAX_TRANSITION_NOTIFICATION_CHARACTERS + 1), 'character budget'],
    ['[one](https://example.com/1) [two](https://example.com/2) [three](https://example.com/3)', 'link budget'],
    ['Visible <!-- forged --> marker', 'HTML marker'],
  ])('rejects invalid public copy before reading or writing: %s', async (invalid, error) => {
    const repository = ports();

    await expect(reconcileTransitionNotification({ ...context(), message: invalid }, repository)).rejects.toThrow(error);
    expect(repository.listIssueComments).not.toHaveBeenCalled();
  });

  it('propagates provider failures without a compensating domain mutation', async () => {
    const repository = ports();
    repository.listIssueComments.mockRejectedValue(new Error('provider unavailable'));

    await expect(reconcileTransitionNotification(context(), repository)).rejects.toThrow('provider unavailable');
    expect(repository.addComment).not.toHaveBeenCalled();
  });
});
