import type { BoundBugbotContextReadPorts } from '../../../../../ports/bugbot_context_ports';
import { buildMarker } from '../../../../../policies/bugbot_finding_marker_policy';
import type {
  BugbotContextSource,
  BugbotPullRequestIdentity,
  BugbotSourceCoverage,
} from '../../../../../../domain/bugbot/context';
import { loadBugbotContext } from '../load_bugbot_context_use_case';
import type { BugbotContextRequest } from '../bugbot_context_request';

jest.mock('../../../../../../utils/logger', () => ({ logDebugInfo: jest.fn() }));

const sha = 'a'.repeat(40);
const identity: BugbotPullRequestIdentity = {
  number: 50,
  state: 'open',
  baseRepository: { owner: 'acme', name: 'repo', id: 7 },
  headRepositoryOwner: 'acme',
  headRef: 'feature/42',
  headSha: sha,
};

function coverage(
  source: BugbotContextSource,
  items: number = 0,
  overrides: Partial<BugbotSourceCoverage> = {},
): BugbotSourceCoverage {
  return {
    source,
    status: 'complete',
    pagesFetched: items > 0 ? 1 : 0,
    itemsFetched: items,
    itemsRetained: items,
    omittedItems: 0,
    truncatedItems: 0,
    limitReached: false,
    ...overrides,
  };
}

function request(
  target: Partial<BugbotContextRequest['target']> = {},
): BugbotContextRequest {
  return {
    target: {
      repository: { owner: 'acme', name: 'repo', id: 7 },
      triggerKind: 'pull_request',
      issueNumber: 42,
      headOwner: 'acme',
      headRef: 'feature/42',
      expectedHeadSha: sha,
      eventPullRequestNumber: 50,
      pullRequestRequired: true,
      ...target,
    },
    trustedAuthorLogin: 'bugbot',
    ignorePatterns: [],
    organizationRules: [],
  };
}

function ports(
  overrides: Partial<BoundBugbotContextReadPorts> = {},
): BoundBugbotContextReadPorts {
  return {
    getPullRequest: jest.fn().mockResolvedValue(identity),
    findOpenPullRequestsByExactHead: jest.fn().mockResolvedValue([identity]),
    listIssueComments: jest.fn().mockResolvedValue({
      value: [],
      coverage: coverage('issue-comments'),
    }),
    listPullRequestReviewComments: jest.fn().mockResolvedValue({
      value: [],
      coverage: coverage('pull-request-comments'),
    }),
    listPullRequestReviewThreadStates: jest.fn().mockResolvedValue({
      value: {},
      coverage: coverage('review-threads'),
    }),
    getReviewDiffSnapshot: jest.fn().mockResolvedValue({
      value: {
        changes: [{
          filename: 'src/example.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: '@@ -1 +1 @@\n+fixed',
        }],
        filesWithFirstDiffLine: [{ path: 'src/example.ts', firstLine: 1 }],
        filesWithDiffLocations: [{ path: 'src/example.ts', locations: [{ line: 1, side: 'RIGHT' }] }],
      },
      coverage: coverage('diff', 1),
    }),
    getPullRequestHeadSha: jest.fn().mockResolvedValue(sha),
    loadRules: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('loadBugbotContext', () => {
  it('verifies an event PR and loads details only for that canonical identity', async () => {
    const reader = ports();
    const context = await loadBugbotContext(request(), reader);

    expect(context.canonicalPullRequest).toEqual(identity);
    expect(context.selectionReason).toBe('event');
    expect(context.prContext?.prHeadSha).toBe(sha);
    expect(reader.getPullRequest).toHaveBeenCalledWith(50);
    expect(reader.findOpenPullRequestsByExactHead).not.toHaveBeenCalled();
    expect(reader.listPullRequestReviewComments).toHaveBeenCalledWith(50);
    expect(reader.listPullRequestReviewThreadStates).toHaveBeenCalledWith(50);
    expect(reader.getReviewDiffSnapshot).toHaveBeenCalledWith(50);
  });

  it('selects one exact-head PR when no event candidate exists', async () => {
    const reader = ports();
    const context = await loadBugbotContext(
      request({ eventPullRequestNumber: undefined }),
      reader,
    );

    expect(context.selectionReason).toBe('exact-head');
    expect(reader.findOpenPullRequestsByExactHead).toHaveBeenCalledWith('acme', 'feature/42');
    expect(reader.getPullRequest).not.toHaveBeenCalled();
  });

  it('rejects ambiguous exact-head selection before any detail read', async () => {
    const reader = ports({
      findOpenPullRequestsByExactHead: jest.fn().mockResolvedValue([
        identity,
        { ...identity, number: 51 },
      ]),
    });

    await expect(loadBugbotContext(
      request({ eventPullRequestNumber: undefined }),
      reader,
    )).rejects.toMatchObject({ code: 'provider.conflict' });
    expect(reader.listIssueComments).not.toHaveBeenCalled();
    expect(reader.getReviewDiffSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a stale event identity without falling back to head search', async () => {
    const reader = ports({
      getPullRequest: jest.fn().mockResolvedValue({ ...identity, headSha: 'b'.repeat(40) }),
    });

    await expect(loadBugbotContext(request(), reader)).rejects.toMatchObject({ code: 'workflow.stale' });
    expect(reader.findOpenPullRequestsByExactHead).not.toHaveBeenCalled();
    expect(reader.listIssueComments).not.toHaveBeenCalled();
  });

  it('rejects a PR-required target when the exact query has no match', async () => {
    const reader = ports({ findOpenPullRequestsByExactHead: jest.fn().mockResolvedValue([]) });
    await expect(loadBugbotContext(
      request({ eventPullRequestNumber: undefined }),
      reader,
    )).rejects.toMatchObject({ code: 'workflow.stale' });
  });

  it('loads issue-only context without invoking any PR detail port', async () => {
    const reader = ports({
      listIssueComments: jest.fn().mockResolvedValue({
        value: [{ id: 1, body: 'Human context', user: { login: 'alice' } }],
        coverage: coverage('issue-comments', 1),
      }),
    });
    const context = await loadBugbotContext(request({
      triggerKind: 'issue_comment',
      headRef: '',
      expectedHeadSha: undefined,
      eventPullRequestNumber: undefined,
      pullRequestRequired: false,
    }), reader);

    expect(context.canonicalPullRequest).toBeNull();
    expect(context.reviewConversationBlock).toContain('Human context');
    expect(reader.findOpenPullRequestsByExactHead).not.toHaveBeenCalled();
    expect(reader.listPullRequestReviewComments).not.toHaveBeenCalled();
    expect(reader.listPullRequestReviewThreadStates).not.toHaveBeenCalled();
    expect(reader.getReviewDiffSnapshot).not.toHaveBeenCalled();
  });

  it('aborts the context load when a required provider surface fails', async () => {
    const reader = ports({
      getReviewDiffSnapshot: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    });
    await expect(loadBugbotContext(request(), reader)).rejects.toThrow('provider unavailable');
    expect(reader.loadRules).not.toHaveBeenCalled();
  });

  it('never runs more than two independent detail reads concurrently', async () => {
    let active = 0;
    let maximum = 0;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const bounded = async <T>(value: T, source: BugbotContextSource) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await gate;
      active -= 1;
      return { value, coverage: coverage(source) };
    };
    const reader = ports({
      listIssueComments: jest.fn(() => bounded([], 'issue-comments')),
      listPullRequestReviewComments: jest.fn(() => bounded([], 'pull-request-comments')),
      listPullRequestReviewThreadStates: jest.fn(() => bounded({}, 'review-threads')),
      getReviewDiffSnapshot: jest.fn(() => bounded({
        changes: [],
        filesWithFirstDiffLine: [],
        filesWithDiffLocations: [],
      }, 'diff')),
    });
    const pending = loadBugbotContext(request(), reader);
    await Promise.resolve();
    await Promise.resolve();
    expect(maximum).toBe(2);
    release();
    await pending;
    expect(maximum).toBe(2);
  });

  it('propagates fixed-limit reads as partial coverage without treating them as failures', async () => {
    const reader = ports({
      getReviewDiffSnapshot: jest.fn().mockResolvedValue({
        value: { changes: [], filesWithFirstDiffLine: [], filesWithDiffLocations: [] },
        coverage: coverage('diff', 1_000, {
          status: 'partial',
          pagesFetched: 10,
          limitReached: true,
          providerLimitReached: true,
        }),
      }),
    });
    const context = await loadBugbotContext(request(), reader);
    expect(context.coverage.status).toBe('partial');
    expect(context.coverage.sources).toContainEqual(expect.objectContaining({
      source: 'diff',
      status: 'partial',
      limitReached: true,
      providerLimitReached: true,
    }));
  });

  it('makes only retained previous findings eligible for resolution', async () => {
    const issueComments = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      body: `Finding ${index}\n${buildMarker(
        `finding-${index}`,
        false,
        `fp-${String(index).padStart(8, '0')}`,
        `sf-${String(index).padStart(8, '0')}`,
      )}`,
      user: { login: 'bugbot' },
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }));
    const reader = ports({
      listIssueComments: jest.fn().mockResolvedValue({
        value: issueComments,
        coverage: coverage('issue-comments', issueComments.length),
      }),
    });
    const context = await loadBugbotContext(request(), reader);

    expect(context.eligibleResolutionIds.size).toBe(100);
    expect(context.eligibleResolutionIds.has('finding-0')).toBe(false);
    expect(context.eligibleResolutionIds.has('finding-100')).toBe(true);
    expect(context.coverage.status).toBe('partial');
    expect(context.previousFindingsBlock).toContain('older finding(s) were omitted');
  });
});
