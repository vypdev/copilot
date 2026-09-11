import type { Execution } from '../../../../../../data/model/execution';
import type {
  PullRequestReviewComment,
  PullRequestReviewSummary,
  PullRequestReviewThreadState,
} from '../../../../../ports/pull_request_review_comment_ports';
import { buildMarker } from '../marker';
import { reconcileBugbotReviewState } from '../reconcile_bugbot_review_state_use_case';
import type { BugbotContext, BugbotFinding } from '../types';

const head = 'a'.repeat(40);
const marker = (resolved = false, resolution?: 'fixed' | 'obsolete' | 'dismissed') =>
  buildMarker('finding-1', resolved, 'fp-11111111', 'sf-11111111', resolution);

function execution(): Execution {
  return {
    owner: 'org',
    repo: 'repo',
    tokenUser: 'bugbot',
    tokens: { token: 'token' },
    locale: { pullRequest: 'en-US' },
  } as unknown as Execution;
}

function context(existingResolved = false): BugbotContext {
  return {
    existingByFindingId: existingResolved
      ? {
          'finding-1': {
            pullRequest: {
              commentIdentity: 'PRRC_1',
              pullRequestNumber: 358,
              resolved: true,
              threadResolved: true,
              resolution: 'fixed',
              parentReviewIdentity: '77',
            },
          },
        }
      : {},
    issueComments: [],
    openPrNumbers: [358],
    previousFindingsBlock: '',
    prContext: {
      prHeadSha: head,
      prFiles: [{ filename: 'src/a.ts', status: 'modified' }],
      pathToFirstDiffLine: { 'src/a.ts': 1 },
    },
    unresolvedFindingsWithBody: [],
  };
}

function finding(): BugbotFinding {
  return {
    id: 'finding-1',
    title: 'Unsafe retry',
    description: 'Retry can publish twice.',
    file: 'src/a.ts',
    line: 1,
  };
}

function harness(options: {
  currentHead?: string;
  comment?: PullRequestReviewComment;
  thread?: PullRequestReviewThreadState;
  reviews?: PullRequestReviewSummary[];
  statusComments?: Array<{ id: number; body: string | null; user?: { login?: string } }>;
  updateReviewError?: Error;
} = {}) {
  const comments = options.comment ? [options.comment] : [];
  const reviews = options.reviews ?? [];
  const statusComments = options.statusComments ?? [];
  const addComment = jest.fn().mockResolvedValue(undefined);
  const updateComment = jest.fn().mockResolvedValue(undefined);
  const updatePullRequestReview = options.updateReviewError
    ? jest.fn().mockRejectedValue(options.updateReviewError)
    : jest.fn().mockResolvedValue(undefined);
  const contextPorts = {
    issue: { listIssueComments: jest.fn().mockResolvedValue(statusComments) },
    pullRequest: {
      getHeadBranchForIssue: jest.fn(),
      getPullRequestReviewCommentBody: jest.fn(),
      getOpenPullRequestNumbersByHeadBranch: jest.fn(),
      listPullRequestReviewComments: jest.fn().mockResolvedValue(comments),
      getPullRequestHeadSha: jest.fn().mockResolvedValue(options.currentHead ?? head),
      getReviewDiffSnapshot: jest.fn(),
      listPullRequestReviewThreadStates: jest.fn().mockResolvedValue(
        options.comment ? { [options.comment.identity]: options.thread ?? { resolved: false } } : {},
      ),
    },
    reviewState: { listPullRequestReviews: jest.fn().mockResolvedValue(reviews) },
    navigation: {
      forPullRequest: jest.fn().mockReturnValue({
        pullRequestUrl: 'https://github.com/org/repo/pull/358',
        commitUrl: `https://github.com/org/repo/commit/${head}`,
        runUrl: 'https://github.com/org/repo/actions/runs/123',
      }),
    },
    rules: { loadRules: jest.fn() },
  };
  const publicationPorts = {
    issueComments: { addComment, updateComment },
    pullRequestComments: {
      createReviewWithComments: jest.fn(),
      updatePullRequestReviewComment: jest.fn(),
      unresolvePullRequestReviewThread: jest.fn(),
    },
    reviewState: { updatePullRequestReview },
  };
  return {
    contextPorts,
    publicationPorts,
    addComment,
    updateComment,
    updatePullRequestReview,
  };
}

describe('reconcileBugbotReviewState', () => {
  it('does nothing when no pull request or analyzed head belongs to the context', async () => {
    const test = harness();
    await expect(reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: { ...context(), openPrNumbers: [] },
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    })).resolves.toBeUndefined();
    await expect(reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: { ...context(), prContext: null },
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    })).resolves.toBeUndefined();
    expect(test.contextPorts.pullRequest.getPullRequestHeadSha).not.toHaveBeenCalled();
  });

  it('re-reads a fixed thread, updates its parent review, and creates one status card', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        parentReviewIdentity: '77',
        authorLogin: 'bugbot',
        body: `## Unsafe retry\n\nD\n${marker(true, 'fixed')}`,
        url: 'https://github.com/org/repo/pull/358#discussion_r1',
      },
      thread: { resolved: true, resolvedByLogin: 'bugbot' },
      reviews: [{
        identity: '77',
        authorLogin: 'bugbot',
        commitId: 'b'.repeat(40),
        body: '## 🤖 Bugbot review\n\nBugbot found **1** active potential problem(s) in this revision.',
      }],
    });

    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });

    expect(report?.projection.counts.fixed).toBe(1);
    expect(report?.projection.actionableCount).toBe(0);
    expect(test.updatePullRequestReview).toHaveBeenCalledWith(
      'org',
      'repo',
      358,
      '77',
      expect.stringContaining('All findings originating in this review are resolved'),
      'token',
    );
    expect(test.addComment).toHaveBeenCalledWith(
      'org',
      'repo',
      358,
      expect.stringContaining('No active findings'),
      'token',
      { commitSha: head },
    );
  });

  it('attributes a human-resolved open marker as dismissed', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: `## Finding\n\n${marker(false)}`,
      },
      thread: { resolved: true, resolvedByLogin: 'maintainer' },
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.dismissed).toBe(1);
  });

  it('projects a previously resolved finding reported again as reopened', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: marker(false),
      },
      thread: { resolved: false },
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [finding()],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.reopened).toBe(1);
  });

  it('fails closed when an expected publication is not visible on the final read', async () => {
    const test = harness();
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [finding()],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.unknown).toBe(1);
    expect(report?.projection.outcome).toBe('partial');
    expect(report?.errors[0].message).toContain('not yet observable');
  });

  it('does not treat intentionally unpersisted overflow as a missing publication', async () => {
    const visible = finding();
    const overflow = { ...finding(), id: 'overflow-1', title: 'Overflow finding' };
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: marker(false),
      },
      thread: { resolved: false },
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [visible, overflow],
      expectedPublishedFindings: [visible],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.open).toBe(2);
    expect(report?.projection.counts.unknown).toBe(0);
    expect(report?.projection.findings).toContainEqual(expect.objectContaining({
      id: 'overflow-1',
      state: 'open',
    }));
    expect(report?.errors).toEqual([]);
  });

  it('fails closed when a trusted provider comment contains a malformed finding marker', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_malformed',
        authorLogin: 'bugbot',
        body: '<!-- copilot-bugbot finding_id:"finding-1" resolved:maybe -->',
      },
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.unknown).toBe(1);
    expect(report?.projection.actionableCount).toBe(0);
    expect(report?.projection.findings[0]?.id).toBe('malformed-comment-PRRC_malformed');
    expect(test.addComment).toHaveBeenCalledWith(
      'org', 'repo', 358, expect.stringContaining('Unknown | 1'), 'token', { commitSha: head },
    );
  });

  it('fails closed when a trusted review contains a malformed finding marker', async () => {
    const test = harness({
      reviews: [{
        identity: '77',
        authorLogin: 'bugbot',
        body: '<!-- copilot-bugbot finding_id:"finding-1" resolved:maybe -->',
        url: 'https://github.com/org/repo/pull/358#pullrequestreview-77',
      }],
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.findings).toEqual([
      expect.objectContaining({
        id: 'malformed-review-77',
        state: 'unknown',
        parentReviewIdentity: '77',
      }),
    ]);
    expect(report?.errors.map((error) => error.message)).toContain(
      'A trusted Bugbot finding marker is malformed.',
    );
  });

  it('uses a trusted review-only marker but never lets it override inline evidence', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        parentReviewIdentity: '77',
        authorLogin: 'bugbot',
        body: marker(true, 'fixed'),
        url: 'https://github.com/org/repo/pull/358#discussion_r1',
      },
      thread: { resolved: true, resolvedByLogin: 'bugbot' },
      reviews: [
        {
          identity: '77',
          authorLogin: 'bugbot',
          body: marker(false),
          url: 'https://attacker.example/review/77',
        },
        {
          identity: '88',
          authorLogin: 'bugbot',
          body: buildMarker('review-only', false, 'fp-22222222', 'sf-22222222'),
          url: 'https://github.com/org/repo/pull/358#pullrequestreview-88',
        },
        {
          identity: '99',
          authorLogin: 'maintainer',
          body: buildMarker('spoofed', false, 'fp-33333333', 'sf-33333333'),
        },
      ],
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'finding-1',
        state: 'fixed',
        url: 'https://github.com/org/repo/pull/358#discussion_r1',
      }),
      expect.objectContaining({
        id: 'review-only',
        state: 'open',
        parentReviewIdentity: '88',
      }),
    ]));
    expect(report?.projection.findings).toHaveLength(2);
  });

  it('omits off-repository URLs and safely retains Enterprise URLs from provider facts', async () => {
    const test = harness();
    test.contextPorts.pullRequest.listPullRequestReviewComments.mockResolvedValue([
      {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: marker(false),
        url: 'https://attacker.example/steal',
      },
      {
        id: 2,
        identity: 'PRRC_malformed_url',
        authorLogin: 'bugbot',
        body: buildMarker('bad-url', false, 'fp-44444444', 'sf-44444444'),
        url: 'not-a-url',
      },
    ]);
    test.contextPorts.pullRequest.listPullRequestReviewThreadStates.mockResolvedValue({
      PRRC_1: { resolved: false },
      PRRC_malformed_url: { resolved: false },
    });
    let report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.findings[0]?.url).toBeUndefined();
    expect(report?.projection.findings[1]?.url).toBeUndefined();

    test.contextPorts.navigation.forPullRequest.mockReturnValue({
      pullRequestUrl: 'https://github.example.com/org/repo/pull/358',
      commitUrl: `https://github.example.com/org/repo/commit/${head}`,
    });
    test.contextPorts.pullRequest.listPullRequestReviewComments.mockResolvedValue([{
      id: 2,
      identity: 'PRRC_2',
      authorLogin: 'bugbot',
      body: marker(false),
      url: 'https://github.example.com/org/repo/pull/358/files(a)#discussion_r2',
    }]);
    test.contextPorts.pullRequest.listPullRequestReviewThreadStates.mockResolvedValue({
      PRRC_2: { resolved: false },
    });
    report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.findings[0]?.url).toContain('files%28a%29');
  });

  it('classifies marker/thread disagreement as verification-required', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: marker(true, 'fixed'),
      },
      thread: { resolved: false },
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts['verification-required']).toBe(1);
  });

  it('requires verification when final provider state still says fixed but analysis reports the finding', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: marker(true, 'fixed'),
      },
      thread: { resolved: true, resolvedByLogin: 'bugbot' },
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [finding()],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts['verification-required']).toBe(1);
    expect(report?.projection.counts.fixed).toBe(0);
  });

  it('stops presentation writes when a newer head owns the PR', async () => {
    const test = harness({ currentHead: 'b'.repeat(40) });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.outcome).toBe('superseded');
    expect(test.addComment).not.toHaveBeenCalled();
    expect(test.updatePullRequestReview).not.toHaveBeenCalled();
  });

  it('also treats a missing provider head as superseded without publishing', async () => {
    const test = harness();
    test.contextPorts.pullRequest.getPullRequestHeadSha.mockResolvedValue(undefined);
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.outcome).toBe('superseded');
    expect(report?.projection.verifiedHeadSha).toBe(head);
    expect(test.addComment).not.toHaveBeenCalled();
  });

  it('updates the oldest trusted status card and converts duplicates to redirects', async () => {
    const oldProjectionMarker = `<!-- copilot-bugbot-status schema="1" pr="358" verified_head="${head}" digest="12345678" -->`;
    const test = harness({
      statusComments: [
        { id: 10, body: `${oldProjectionMarker}\nold`, user: { login: 'bugbot' } },
        { id: 11, body: `${oldProjectionMarker}\nduplicate`, user: { login: 'bugbot' } },
        { id: 9, body: `${oldProjectionMarker}\nspoof`, user: { login: 'human' } },
      ],
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.statusCardOperation).toBe('updated');
    expect(test.updateComment).toHaveBeenCalledTimes(2);
    expect(test.updateComment).toHaveBeenCalledWith(
      'org', 'repo', 358, 11, expect.stringContaining('no longer current'), 'token', { commitSha: head },
    );
  });

  it('leaves an already-current canonical status card unchanged on replay', async () => {
    const test = harness();
    await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    const publishedBody = test.addComment.mock.calls[0]?.[3] as string;
    test.contextPorts.issue.listIssueComments.mockResolvedValue([
      { id: 10, body: publishedBody, user: { login: 'bugbot' } },
    ]);
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.statusCardOperation).toBe('unchanged');
    expect(test.addComment).toHaveBeenCalledTimes(1);
    expect(test.updateComment).not.toHaveBeenCalled();
  });

  it('reports canonical status-card creation failure without leaking provider details', async () => {
    const test = harness();
    test.addComment.mockRejectedValue(new Error('secret provider detail'));
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.outcome).toBe('failed');
    expect(report?.statusCardOperation).toBe('failed');
    expect(report?.errors.map((error) => error.message)).toContain(
      'Unable to create or update the canonical Bugbot PR status card.',
    );
    expect(report?.errors.map((error) => error.message)).not.toContain(
      'secret provider detail',
    );
  });

  it('reports review-summary write failures as partial while still publishing the card', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        parentReviewIdentity: '77',
        authorLogin: 'bugbot',
        body: marker(true, 'fixed'),
      },
      thread: { resolved: true },
      reviews: [{ identity: '77', authorLogin: 'bugbot', body: 'legacy', commitId: head }],
      updateReviewError: new Error('secret provider detail'),
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.outcome).toBe('partial');
    expect(report?.errors[0].message).toBe('Unable to update Bugbot review 77.');
    expect(test.addComment).toHaveBeenCalledWith(
      'org', 'repo', 358, expect.stringContaining('could not fully synchronize'), 'token', { commitSha: head },
    );
  });

  it('keeps publishing a partial status card when the final thread-state read fails', async () => {
    const test = harness({
      comment: {
        id: 1,
        identity: 'PRRC_1',
        authorLogin: 'bugbot',
        body: marker(false),
      },
    });
    test.contextPorts.pullRequest.listPullRequestReviewThreadStates.mockRejectedValue(
      new Error('provider secret'),
    );
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [finding()],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.unknown).toBe(1);
    expect(report?.projection.outcome).toBe('partial');
    expect(report?.errors.map((error) => error.message)).toContain(
      'Unable to re-read pull request review thread state.',
    );
    expect(test.addComment).toHaveBeenCalledWith(
      'org', 'repo', 358, expect.stringContaining('unknown state'), 'token', { commitSha: head },
    );
  });

  it('keeps partial state when finding and review reads fail independently', async () => {
    const test = harness();
    test.contextPorts.pullRequest.listPullRequestReviewComments.mockRejectedValue(
      new Error('private comment failure'),
    );
    test.contextPorts.reviewState.listPullRequestReviews.mockRejectedValue(
      new Error('private review failure'),
    );
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [finding()],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.counts.unknown).toBe(1);
    expect(report?.projection.outcome).toBe('partial');
    expect(report?.errors.map((error) => error.message)).toEqual(expect.arrayContaining([
      'Unable to re-read pull request review comments.',
      'Unable to re-read pull request reviews.',
    ]));
    expect(test.addComment).toHaveBeenCalledWith(
      'org', 'repo', 358, expect.stringContaining('unknown state'), 'token', { commitSha: head },
    );
  });

  it('does not create a duplicate status card when the PR conversation cannot be read', async () => {
    const test = harness();
    test.contextPorts.issue.listIssueComments.mockRejectedValue(new Error('provider secret'));
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.statusCardOperation).toBe('failed');
    expect(report?.projection.outcome).toBe('failed');
    expect(test.addComment).not.toHaveBeenCalled();
    expect(report?.errors.map((error) => error.message)).not.toContain('provider secret');
  });

  it('does not adopt or create presentation without an authenticated bot identity', async () => {
    const test = harness();
    const withoutIdentity = { ...execution(), tokenUser: undefined } as unknown as Execution;
    const report = await reconcileBugbotReviewState({
      execution: withoutIdentity,
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.statusCardOperation).toBe('failed');
    expect(test.addComment).not.toHaveBeenCalled();
    expect(report?.errors.map((error) => error.message)).toContain(
      'The authenticated Bugbot identity is unavailable.',
    );
  });

  it('fails with a semantic error when the current PR head cannot be read', async () => {
    const test = harness();
    test.contextPorts.pullRequest.getPullRequestHeadSha.mockRejectedValue(
      new Error('provider secret'),
    );
    await expect(reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    })).rejects.toThrow('Unable to get the pull request head commit.');
  });

  it('fails presentation closed when safe provider navigation cannot be built', async () => {
    const test = harness();
    test.contextPorts.navigation.forPullRequest.mockImplementation(() => {
      throw new Error('unsafe provider URL');
    });
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.projection.outcome).toBe('failed');
    expect(report?.statusCardOperation).toBe('failed');
    expect(report?.errors.map((error) => error.message)).toEqual([
      'Unable to build safe Bugbot navigation links.',
    ]);
    expect(test.addComment).not.toHaveBeenCalled();
    expect(test.updatePullRequestReview).not.toHaveBeenCalled();
  });

  it('bounds review updates to twenty and exposes the exact pending count', async () => {
    const comments = Array.from({ length: 22 }, (_, index): PullRequestReviewComment => ({
      id: index + 1,
      identity: `PRRC_${index}`,
      parentReviewIdentity: String(index + 100),
      authorLogin: 'bugbot',
      body: marker(true, 'fixed'),
    }));
    const reviews = comments.map((comment): PullRequestReviewSummary => ({
      identity: comment.parentReviewIdentity!,
      authorLogin: 'bugbot',
      body: 'legacy',
      commitId: head,
    }));
    const test = harness({ reviews });
    test.contextPorts.pullRequest.listPullRequestReviewComments.mockResolvedValue(comments);
    test.contextPorts.pullRequest.listPullRequestReviewThreadStates.mockResolvedValue(
      Object.fromEntries(comments.map((comment) => [comment.identity, { resolved: true }])),
    );
    const report = await reconcileBugbotReviewState({
      execution: execution(),
      loadedContext: context(true),
      activeFindings: [],
      contextPorts: test.contextPorts,
      publicationPorts: test.publicationPorts,
    });
    expect(report?.reviewUpdates).toBe(20);
    expect(report?.pendingReviewUpdates).toBe(2);
    expect(report?.projection.outcome).toBe('partial');
  });
});
