import { Result } from '../../../../../data/model/result';
import type { TransitionPublicationIntent } from '../../../../../domain/github_publication';
import type {
  BoundIssueCommentPublicationPort,
  IssueCommentPublicationTarget,
} from '../../../../ports/issue_lifecycle_ports';
import {
  selectSemanticReplyIntents,
  selectSemanticStatusIntents,
} from '../../../../policies/semantic_result_publication_policy';
import { reconcileReply } from '../reply_publication_workflow';
import { reconcileStatusCard } from '../status_card_publication_workflow';
import { reconcileTransitionNotification } from '../transition_notification_workflow';

const SOURCE_HEAD = 'a'.repeat(40);

function simultaneousCreatePort(): BoundIssueCommentPublicationPort & {
  readonly comments: IssueCommentPublicationTarget[];
} {
  const comments: IssueCommentPublicationTarget[] = [];
  let nextId = 1;
  let additions = 0;
  let releaseCreates: (() => void) | undefined;
  const bothCreatesStarted = new Promise<void>((resolve) => {
    releaseCreates = resolve;
  });
  return {
    comments,
    listIssueComments: jest.fn(async () => comments.map(comment => ({ ...comment }))),
    addComment: jest.fn(async (_issueNumber: number, body: string) => {
      comments.push({ id: nextId, body, user: { login: 'vypbot' } });
      nextId += 1;
      additions += 1;
      if (additions === 2) releaseCreates?.();
      await bothCreatesStarted;
    }),
    updateComment: jest.fn(async (_issueNumber: number, commentId: number, body: string) => {
      const comment = comments.find(candidate => candidate.id === commentId);
      if (comment) comment.body = body;
    }),
    removeComment: jest.fn(async (_issueNumber: number, commentId: number) => {
      const index = comments.findIndex(comment => comment.id === commentId);
      if (index >= 0) comments.splice(index, 1);
      return 'removed' as const;
    }),
  };
}

function statusIntent() {
  return selectSemanticStatusIntents({
    locale: 'en-US',
    results: [new Result({
      id: 'CheckProgressUseCase',
      success: true,
      executed: true,
      payload: {
        issueNumber: 7,
        progress: 50,
        summary: 'Implementation is in progress.',
        branch: 'feature/work',
        sourceHeadSha: SOURCE_HEAD,
      },
    })],
  })[0];
}

function replyIntent() {
  return selectSemanticReplyIntents({
    locale: 'en-US',
    target: { kind: 'issue', number: 7 },
    correlationId: 'comment:41',
    botLogin: 'vypbot',
    results: [new Result({
      id: 'Comment.Help',
      success: true,
      executed: true,
      payload: { publication: { kind: 'help', botLogin: 'vypbot' } },
    })],
  })[0];
}

function transitionIntent(): TransitionPublicationIntent {
  return {
    kind: 'transition',
    identity: {
      topic: 'branch-sync',
      target: { kind: 'issue', number: 7 },
      key: 'develop:feature-7',
    },
    fingerprint: '0123abcd',
    messageKey: 'branch-sync-action-required',
    locale: 'en-US',
    values: {},
  };
}

describe('semantic publication concurrency', () => {
  it('converges simultaneous first status-card creates on the lowest comment id', async () => {
    const comments = simultaneousCreatePort();
    const context = {
      owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: statusIntent(),
    };
    const source = () => ({ getBranchHeadSha: jest.fn(async () => SOURCE_HEAD) });

    const outcomes = await Promise.all([
      reconcileStatusCard(context, comments, source()),
      reconcileStatusCard(context, comments, source()),
    ]);

    expect(outcomes).toEqual([
      expect.objectContaining({ effect: 'created', canonicalCommentId: 1, duplicatesRemoved: 1 }),
      expect.objectContaining({ effect: 'created', canonicalCommentId: 1, duplicatesRemoved: 1 }),
    ]);
    expect(comments.comments.map(comment => comment.id)).toEqual([1]);
  });

  it('converges simultaneous first correlated replies on the lowest comment id', async () => {
    const comments = simultaneousCreatePort();
    const context = {
      owner: 'acme', repository: 'widgets', botLogin: 'vypbot', intent: replyIntent(),
    };

    const outcomes = await Promise.all([
      reconcileReply(context, comments),
      reconcileReply(context, comments),
    ]);

    expect(outcomes).toEqual([
      expect.objectContaining({ effect: 'created', canonicalCommentId: 1, duplicatesRemoved: 1 }),
      expect.objectContaining({ effect: 'created', canonicalCommentId: 1, duplicatesRemoved: 1 }),
    ]);
    expect(comments.comments.map(comment => comment.id)).toEqual([1]);
  });

  it('converges simultaneous first transition notifications on the lowest comment id', async () => {
    const comments = simultaneousCreatePort();
    const context = {
      owner: 'acme',
      repository: 'widgets',
      botLogin: 'vypbot',
      intent: transitionIntent(),
      message: 'Branch synchronization needs attention.',
      duplicatePointer: (url: string) => `This duplicate was suppressed. [View the original](${url}).`,
    };

    const outcomes = await Promise.all([
      reconcileTransitionNotification(context, comments),
      reconcileTransitionNotification(context, comments),
    ]);

    expect(outcomes).toEqual([
      expect.objectContaining({ effect: 'created', canonicalCommentId: 1, duplicatesRemoved: 1 }),
      expect.objectContaining({ effect: 'created', canonicalCommentId: 1, duplicatesRemoved: 1 }),
    ]);
    expect(comments.comments.map(comment => comment.id)).toEqual([1]);
  });
});
