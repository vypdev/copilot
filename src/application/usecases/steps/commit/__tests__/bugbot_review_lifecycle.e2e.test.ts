import { Ai } from '../../../../../data/model/ai';
import type { Execution } from '../../../../../data/model/execution';
import type {
  PullRequestReviewComment,
  PullRequestReviewCommentDraft,
  PullRequestReviewSummary,
  PullRequestReviewThreadState,
} from '../../../../ports/pull_request_review_comment_ports';
import { DetectPotentialProblemsUseCase } from '../detect_potential_problems_use_case';

class InMemoryReviewProvider {
  readonly comments: PullRequestReviewComment[] = [];
  readonly reviews: Array<PullRequestReviewSummary & { comments: PullRequestReviewCommentDraft[] }> = [];
  readonly statusComments: Array<{ id: number; body: string | null; user: { login: string } }> = [];
  readonly threadStates: Record<string, PullRequestReviewThreadState> = {};
  headSha = 'a'.repeat(40);
  private nextId = 1;

  async listIssueComments() { return [...this.statusComments]; }
  async addComment(_owner: string, _repo: string, _number: number, body: string) {
    this.statusComments.push({ id: 10_000 + this.statusComments.length, body, user: { login: 'bot' } });
  }
  async updateComment(_owner: string, _repo: string, _number: number, id: number, body: string) {
    const comment = this.statusComments.find((item) => item.id === id);
    if (comment) comment.body = body;
  }
  async getPullRequestReviewCommentBody() { return null; }
  async listPullRequestReviewComments() { return [...this.comments]; }
  async listPullRequestReviews() { return this.reviews.map((review) => ({ ...review })); }
  async getPullRequestHeadSha() { return this.headSha; }
  async getReviewDiffSnapshot() {
    return {
      changes: [{ filename: 'src/auth.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+return token.admin' }],
      filesWithFirstDiffLine: [{ path: 'src/auth.ts', firstLine: 10 }],
      filesWithDiffLocations: [{ path: 'src/auth.ts', locations: [{ line: 10, side: 'RIGHT' as const }] }],
    };
  }
  async listPullRequestReviewThreadStates() { return { ...this.threadStates }; }
  forPullRequest(_owner: string, _repo: string, pullRequestNumber: number, headSha: string) {
    return {
      pullRequestUrl: `https://github.com/org/repo/pull/${pullRequestNumber}`,
      commitUrl: `https://github.com/org/repo/commit/${headSha}`,
    };
  }

  async createReviewWithComments(
    _owner: string, _repo: string, _pr: number, _sha: string, body: string,
    comments: PullRequestReviewCommentDraft[],
  ) {
    const reviewIdentity = String(1_000 + this.reviews.length);
    this.reviews.push({
      identity: reviewIdentity,
      body,
      authorLogin: 'bot',
      commitId: this.headSha,
      url: `https://github.com/org/repo/pull/7#pullrequestreview-${reviewIdentity}`,
      comments,
    });
    for (const draft of comments) {
      const id = this.nextId++;
      const identity = `PRRC_${id}`;
      this.comments.push({
        id,
        identity,
        body: draft.body,
        path: draft.path,
        line: draft.line,
        authorLogin: 'bot',
        parentReviewIdentity: reviewIdentity,
        url: `https://github.com/org/repo/pull/7#discussion_r${id}`,
      });
      this.threadStates[identity] = { resolved: false };
    }
    return { identity: reviewIdentity };
  }

  async updatePullRequestReviewComment(_owner: string, _repo: string, identity: string, body: string) {
    const comment = this.comments.find((item) => item.identity === identity);
    if (comment) comment.body = body;
  }
  async updatePullRequestReview(_owner: string, _repo: string, _pr: number, identity: string, body: string) {
    const review = this.reviews.find((item) => item.identity === identity);
    if (review) review.body = body;
  }
  async resolvePullRequestReviewThread(_owner: string, _repo: string, _pr: number, identity: string) {
    this.threadStates[identity] = { resolved: true, resolvedByLogin: 'bot' };
  }
  async unresolvePullRequestReviewThread(_owner: string, _repo: string, _pr: number, identity: string) {
    this.threadStates[identity] = { resolved: false };
  }
}

function contextPorts(provider: InMemoryReviewProvider) {
  const bounded = <T>(source: import('../../../../../domain/bugbot/context').BugbotContextSource, value: T, items: number) => ({
    value,
    coverage: {
      source,
      status: 'complete' as const,
      pagesFetched: items > 0 ? 1 : 0,
      itemsFetched: items,
      itemsRetained: items,
      omittedItems: 0,
      truncatedItems: 0,
      limitReached: false,
    },
  });
  const rules = { loadRules: async () => [] };
  return {
    loader: {
      bind: () => ({
        getPullRequest: async (number: number) => ({
          number,
          state: 'open' as const,
          baseRepository: { owner: 'org', name: 'repo' },
          headRepositoryOwner: 'org',
          headRef: 'feature/review',
          headSha: provider.headSha,
        }),
        findOpenPullRequestsByExactHead: async () => [],
        listIssueComments: async (number: number) => {
          const value = await provider.listIssueComments();
          return bounded('issue-comments', value, value.length);
        },
        listPullRequestReviewComments: async (number: number) => {
          const value = await provider.listPullRequestReviewComments();
          return bounded('pull-request-comments', value, value.length);
        },
        listPullRequestReviewThreadStates: async (number: number) => {
          const value = await provider.listPullRequestReviewThreadStates();
          return bounded('review-threads', value, Object.keys(value).length);
        },
        getReviewDiffSnapshot: async (number: number) => {
          const value = await provider.getReviewDiffSnapshot();
          return bounded('diff', value, value.changes.length);
        },
        getPullRequestHeadSha: async () => provider.headSha,
        loadRules: rules.loadRules,
      }),
    },
    issue: provider,
    pullRequest: provider,
    reviewState: provider,
    navigation: provider,
    rules,
  };
}

function execution(mode: 'publish' | 'dry-run' = 'publish'): Execution {
  return {
    owner: 'org', repo: 'repo', issueNumber: -1, tokenUser: 'bot', tokens: { token: 'token' },
    isPullRequest: true,
    inputs: { eventName: 'pull_request', pull_request: { head: { sha: 'a'.repeat(40) } } },
    pullRequest: { number: 7, head: 'feature/review', action: 'opened' },
    commit: { branch: 'feature/review' }, currentConfiguration: { parentBranch: 'main' }, branches: { development: 'main' },
    ai: new Ai('', 'model', false, [], false, 'low', 20, [], undefined, undefined, { publicationMode: mode, traceRules: true }),
  } as unknown as Execution;
}

function finding(id = 'unchecked-token', file = 'src/auth.ts') {
  return {
    id, title: 'Unchecked token', description: 'The token is used before validation.',
    file, line: 10, severity: 'high', confidence: 0.95, category: 'security',
    symbol: 'authorize', codeSnippet: 'return token.admin', suggestedCode: 'return token?.admin === true',
  };
}

describe('Bugbot review lifecycle E2E contract', () => {
  it('publishes one native review and durably suppresses a manually dismissed moved finding', async () => {
    const provider = new InMemoryReviewProvider();
    const responses = [{ findings: [finding()] }, { findings: [finding('renamed-id', 'src/security/auth.ts')] }];
    const telemetry: unknown[] = [];
    const useCase = new DetectPotentialProblemsUseCase(
      { query: jest.fn(async () => responses.shift()) },
      contextPorts(provider),
      { issueComments: provider, pullRequestComments: provider, reviewState: provider },
      { issueComments: provider, pullRequestComments: provider },
      { publish: (snapshot) => { telemetry.push(snapshot); } },
    );

    await useCase.invoke(execution());
    expect(provider.reviews).toHaveLength(1);
    expect(provider.reviews[0].body).toContain('## 🤖 Bugbot review');
    expect(provider.reviews[0].comments[0].body).toContain('```suggestion');
    provider.threadStates[provider.comments[0].identity] = {
      resolved: true,
      resolvedByLogin: 'maintainer',
    };

    const second = await useCase.invoke(execution());
    expect(provider.reviews).toHaveLength(1);
    expect(second[0].payload).toEqual(expect.objectContaining({ findingStates: expect.objectContaining({ dismissed: 1 }) }));
    expect(telemetry).toHaveLength(2);
  });

  it('executes analysis in dry-run mode without any provider mutation', async () => {
    const provider = new InMemoryReviewProvider();
    const useCase = new DetectPotentialProblemsUseCase(
      { query: jest.fn(async () => ({ findings: [finding()] })) },
      contextPorts(provider),
      { issueComments: provider, pullRequestComments: provider, reviewState: provider },
      { issueComments: provider, pullRequestComments: provider },
    );

    const results = await useCase.invoke(execution('dry-run'));
    expect(provider.reviews).toEqual([]);
    expect(provider.comments).toEqual([]);
    expect(results[0].payload).toEqual(expect.objectContaining({ dryRun: true, findings: [expect.objectContaining({ id: 'unchecked-token' })] }));
  });
});
