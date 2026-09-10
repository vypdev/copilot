import { Ai } from '../../../../../data/model/ai';
import type { Execution } from '../../../../../data/model/execution';
import type { PullRequestReviewComment, PullRequestReviewCommentDraft } from '../../../../ports/pull_request_review_comment_ports';
import { DetectPotentialProblemsUseCase } from '../detect_potential_problems_use_case';

class InMemoryReviewProvider {
  readonly comments: PullRequestReviewComment[] = [];
  readonly reviews: Array<{ body: string; comments: PullRequestReviewCommentDraft[] }> = [];
  readonly threadStates: Record<string, boolean> = {};
  headSha = 'a'.repeat(40);
  private nextId = 1;

  async listIssueComments() { return []; }
  async addComment() { /* PR lifecycle never writes issue comments. */ }
  async updateComment() { /* PR lifecycle never writes issue comments. */ }
  async getHeadBranchForIssue() { return 'feature/review'; }
  async getPullRequestReviewCommentBody() { return null; }
  async getOpenPullRequestNumbersByHeadBranch() { return [7]; }
  async listPullRequestReviewComments() { return [...this.comments]; }
  async getPullRequestHeadSha() { return this.headSha; }
  async getReviewDiffSnapshot() {
    return {
      changes: [{ filename: 'src/auth.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+return token.admin' }],
      filesWithFirstDiffLine: [{ path: 'src/auth.ts', firstLine: 10 }],
      filesWithDiffLocations: [{ path: 'src/auth.ts', locations: [{ line: 10, side: 'RIGHT' as const }] }],
    };
  }
  async listPullRequestReviewThreadStates() { return { ...this.threadStates }; }

  async createReviewWithComments(
    _owner: string, _repo: string, _pr: number, _sha: string, body: string,
    comments: PullRequestReviewCommentDraft[],
  ) {
    this.reviews.push({ body, comments });
    for (const draft of comments) {
      const id = this.nextId++;
      const identity = `PRRC_${id}`;
      this.comments.push({ id, identity, body: draft.body, path: draft.path, line: draft.line, authorLogin: 'bot' });
      this.threadStates[identity] = false;
    }
  }

  async updatePullRequestReviewComment(_owner: string, _repo: string, identity: string, body: string) {
    const comment = this.comments.find((item) => item.identity === identity);
    if (comment) comment.body = body;
  }
  async resolvePullRequestReviewThread(_owner: string, _repo: string, _pr: number, identity: string) { this.threadStates[identity] = true; }
  async unresolvePullRequestReviewThread(_owner: string, _repo: string, _pr: number, identity: string) { this.threadStates[identity] = false; }
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
      { issue: provider, pullRequest: provider, rules: { loadRules: async () => [] } },
      { issueComments: provider, pullRequestComments: provider },
      { issueComments: provider, pullRequestComments: provider },
      { publish: (snapshot) => { telemetry.push(snapshot); } },
    );

    await useCase.invoke(execution());
    expect(provider.reviews).toHaveLength(1);
    expect(provider.reviews[0].body).toContain('## 🤖 Bugbot review');
    expect(provider.reviews[0].comments[0].body).toContain('```suggestion');
    provider.threadStates[provider.comments[0].identity] = true;

    const second = await useCase.invoke(execution());
    expect(provider.reviews).toHaveLength(1);
    expect(second[0].payload).toEqual(expect.objectContaining({ findingStates: expect.objectContaining({ dismissed: 1 }) }));
    expect(telemetry).toHaveLength(2);
  });

  it('executes analysis in dry-run mode without any provider mutation', async () => {
    const provider = new InMemoryReviewProvider();
    const useCase = new DetectPotentialProblemsUseCase(
      { query: jest.fn(async () => ({ findings: [finding()] })) },
      { issue: provider, pullRequest: provider, rules: { loadRules: async () => [] } },
      { issueComments: provider, pullRequestComments: provider },
      { issueComments: provider, pullRequestComments: provider },
    );

    const results = await useCase.invoke(execution('dry-run'));
    expect(provider.reviews).toEqual([]);
    expect(provider.comments).toEqual([]);
    expect(results[0].payload).toEqual(expect.objectContaining({ dryRun: true, findings: [expect.objectContaining({ id: 'unchecked-token' })] }));
  });
});
