import { buildAgentTasksFromValues } from '../../../../../actions/agent_input_builder';
import type { FindingsQueryRequest } from '../../../../ports/agent_findings_ports';
import type { BugbotShadowVerificationPort } from '../../../../ports/bugbot_shadow_verification_ports';
import { Ai } from '../../../../../data/model/ai';
import type { Execution } from '../../../../../data/model/execution';
import type {
  PullRequestReviewComment,
  PullRequestReviewCommentDraft,
  PullRequestReviewSummary,
  PullRequestReviewThreadState,
} from '../../../../ports/pull_request_review_comment_ports';
import { DetectPotentialProblemsUseCase } from '../detect_potential_problems_use_case';
import { projectBugbotReviewOperationContext } from '../bugbot/bugbot_review_operation_context';

class InMemoryReviewProvider {
  readonly comments: PullRequestReviewComment[] = [];
  readonly reviews: Array<PullRequestReviewSummary & { comments: PullRequestReviewCommentDraft[] }> = [];
  readonly statusComments: Array<{ id: number; body: string | null; user: { login: string } }> = [];
  readonly threadStates: Record<string, PullRequestReviewThreadState> = {};
  headSha = 'a'.repeat(40);
  private nextId = 1;

  async listIssueComments() { return [...this.statusComments]; }
  async addComment(_number: number, body: string) {
    this.statusComments.push({ id: 10_000 + this.statusComments.length, body, user: { login: 'bot' } });
  }
  async updateComment(_number: number, id: number, body: string) {
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
  forPullRequest(pullRequestNumber: number, headSha: string) {
    return {
      pullRequestUrl: `https://github.com/org/repo/pull/${pullRequestNumber}`,
      commitUrl: `https://github.com/org/repo/commit/${headSha}`,
    };
  }

  async createReviewWithComments(
    _pr: number, _sha: string, body: string,
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

  async updatePullRequestReviewComment(identity: string, body: string) {
    const comment = this.comments.find((item) => item.identity === identity);
    if (comment) comment.body = body;
  }
  async updatePullRequestReview(_pr: number, identity: string, body: string) {
    const review = this.reviews.find((item) => item.identity === identity);
    if (review) review.body = body;
  }
  async resolvePullRequestReviewThread(_pr: number, identity: string) {
    this.threadStates[identity] = { resolved: true, resolvedByLogin: 'bot' };
  }
  async unresolvePullRequestReviewThread(_pr: number, identity: string) {
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
    getPullRequest: async (number: number) => ({
      number,
      state: 'open' as const,
      draft: false,
      baseRepository: { owner: 'org', name: 'repo' },
      headRepositoryOwner: 'org',
      headRef: 'feature/review',
      headSha: provider.headSha,
    }),
    findOpenPullRequestsByExactHead: async () => [],
    listIssueComments: async (_number: number) => {
      const value = await provider.listIssueComments();
      return bounded('issue-comments', value, value.length);
    },
    listPullRequestReviewComments: async (_number: number) => {
      const value = await provider.listPullRequestReviewComments();
      return bounded('pull-request-comments', value, value.length);
    },
    listPullRequestReviewThreadStates: async (_number: number) => {
      const value = await provider.listPullRequestReviewThreadStates();
      return bounded('review-threads', value, Object.keys(value).length);
    },
    getReviewDiffSnapshot: async (_number: number) => {
      const value = await provider.getReviewDiffSnapshot();
      return bounded('diff', value, value.changes.length);
    },
    getPullRequestHeadSha: async () => provider.headSha,
    getPullRequestReviewCommentBody: provider.getPullRequestReviewCommentBody.bind(provider),
    loadRules: rules.loadRules,
  };
}

function scmPorts(provider: InMemoryReviewProvider) {
  return {
    context: contextPorts(provider),
    publication: {
      issueComments: provider,
      pullRequestComments: provider,
    },
    resolution: {
      issueComments: provider,
      pullRequestComments: provider,
    },
    reconciliation: {
      snapshot: {
        listIssueComments: provider.listIssueComments.bind(provider),
        listPullRequestReviewComments: provider.listPullRequestReviewComments.bind(provider),
        listPullRequestReviewThreadStates: provider.listPullRequestReviewThreadStates.bind(provider),
        listPullRequestReviews: provider.listPullRequestReviews.bind(provider),
        getPullRequestHeadSha: provider.getPullRequestHeadSha.bind(provider),
        navigationForPullRequest: provider.forPullRequest.bind(provider),
      },
      presentation: {
        comments: provider,
        updatePullRequestReview: provider.updatePullRequestReview.bind(provider),
      },
    },
  };
}

function execution(
  mode: 'publish' | 'dry-run' = 'publish',
  ignorePatterns: readonly string[] = [],
  inputs?: Record<string, string>,
): Execution {
  return {
    owner: 'org', repo: 'repo', issueNumber: -1, tokenUser: 'bot', tokens: { token: 'token' },
    locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
    isPullRequest: true,
    inputs: { eventName: 'pull_request', pull_request: { head: { sha: 'a'.repeat(40) } } },
    pullRequest: { number: 7, head: 'feature/review', action: 'opened' },
    commit: { branch: 'feature/review' }, currentConfiguration: { parentBranch: 'main' }, branches: { development: 'main' },
    ai: new Ai('', 'model', false, [...ignorePatterns], false, 'low', 20, [], inputs && buildAgentTasksFromValues(inputs), undefined, { publicationMode: mode, traceRules: true }),
  } as unknown as Execution;
}

function finding(id = 'unchecked-token', file = 'src/auth.ts') {
  return {
    id, title: 'Unchecked token', description: 'The token is used before validation.',
    file, line: 10, severity: 'high', confidence: 0.95, category: 'security',
    symbol: 'authorize', codeSnippet: 'return token.admin', suggestedCode: 'return token?.admin === true',
  };
}

function attestPartitionResponse(
  prompt: string,
  response: { outputLocale: string; findings: ReturnType<typeof finding>[]; resolved_findings: unknown[] },
) {
  return {
    ...response,
    partition_id: prompt.match(/Return partition_id exactly as `([^`]+)`/u)?.[1],
    reviewed_head_sha: 'a'.repeat(40),
  };
}

describe('Bugbot review lifecycle E2E contract', () => {
  it('publishes one native review and durably suppresses a manually dismissed moved finding', async () => {
    const provider = new InMemoryReviewProvider();
    const responses = [
      { outputLocale: 'en-US', findings: [finding()], resolved_findings: [] },
      { outputLocale: 'en-US', findings: [finding('renamed-id', 'src/security/auth.ts')], resolved_findings: [] },
    ];
    const telemetry: unknown[] = [];
    const useCase = new DetectPotentialProblemsUseCase(
      { query: jest.fn(async ({ prompt }) => attestPartitionResponse(prompt, responses.shift()!)) },
      scmPorts(provider),
      { publish: (snapshot) => { telemetry.push(snapshot); } },
    );

    await useCase.invoke(projectBugbotReviewOperationContext(execution()));
    expect(provider.reviews).toHaveLength(1);
    expect(provider.reviews[0].body).toContain('## 🤖 Bugbot review');
    expect(provider.reviews[0].comments[0].body).toContain('```suggestion');
    provider.threadStates[provider.comments[0].identity] = {
      resolved: true,
      resolvedByLogin: 'maintainer',
    };

    const second = await useCase.invoke(projectBugbotReviewOperationContext(execution()));
    expect(provider.reviews).toHaveLength(1);
    expect(second[0].payload).toEqual(expect.objectContaining({ findingStates: expect.objectContaining({ dismissed: 1 }) }));
    expect(telemetry).toHaveLength(2);
  });

  it('executes analysis in dry-run mode without any provider mutation', async () => {
    const provider = new InMemoryReviewProvider();
    const useCase = new DetectPotentialProblemsUseCase(
      {
        query: jest.fn(async ({ prompt }) => attestPartitionResponse(prompt, {
          outputLocale: 'en-US', findings: [finding()], resolved_findings: [],
        })),
      },
      scmPorts(provider),
    );

    const results = await useCase.invoke(
      projectBugbotReviewOperationContext(execution('dry-run')),
    );
    expect(provider.reviews).toEqual([]);
    expect(provider.comments).toEqual([]);
    expect(results[0].payload).toEqual(expect.objectContaining({ dryRun: true, findings: [expect.objectContaining({ id: 'unchecked-token' })] }));
  });

  it('keeps an existing finding open when the canonical diff becomes ignored-only', async () => {
    const provider = new InMemoryReviewProvider();
    const query = jest.fn(async ({ prompt }) => attestPartitionResponse(prompt, {
      outputLocale: 'en-US', findings: [finding()], resolved_findings: [],
    }));
    const useCase = new DetectPotentialProblemsUseCase({ query }, scmPorts(provider));

    await useCase.invoke(projectBugbotReviewOperationContext(execution()));
    const findingIdentity = provider.comments[0].identity;

    const results = await useCase.invoke(
      projectBugbotReviewOperationContext(execution('publish', ['src/auth.ts'])),
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(provider.comments).toHaveLength(1);
    expect(provider.threadStates[findingIdentity]).toEqual({ resolved: false });
    expect(provider.comments[0].body).toContain('resolved:false');
    expect(results[0].payload).toEqual(expect.objectContaining({
      findingStates: expect.objectContaining({ open: 1, fixed: 0, obsolete: 0 }),
    }));
  });

  it('publishes nothing when a partition attestation is invalid', async () => {
    const provider = new InMemoryReviewProvider();
    const useCase = new DetectPotentialProblemsUseCase(
      {
        query: jest.fn(async () => ({
          outputLocale: 'en-US',
          partition_id: 'wrong-partition',
          reviewed_head_sha: provider.headSha,
          findings: [finding()],
          resolved_findings: [],
        })),
      },
      scmPorts(provider),
    );

    const results = await useCase.invoke(projectBugbotReviewOperationContext(execution()));

    expect(results[0].success).toBe(false);
    expect(provider.reviews).toEqual([]);
    expect(provider.comments).toEqual([]);
    expect(provider.statusComments).toEqual([]);
  });
});

describe('Bugbot normal review in shadow', () => {
  function detector(findings: ReturnType<typeof finding>[]) {
    return jest.fn(async (request: FindingsQueryRequest) => attestPartitionResponse(request.prompt, {
      outputLocale: 'en-US', findings, resolved_findings: [],
    }));
  }

  it('opens no independent session when the ordinary detector returns zero findings', async () => {
    const provider = new InMemoryReviewProvider();
    const query = detector([]);
    const verify = jest.fn();
    const results = await new DetectPotentialProblemsUseCase({ query }, scmPorts(provider), undefined, undefined, { verify })
      .invoke(projectBugbotReviewOperationContext(execution('dry-run', [], {})));

    expect(query).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
    expect(results[0].payload).toMatchObject({ dryRun: true, findings: [],
      bugbotShadowVerification: { resolvedModel: 'gpt-6-luna', candidates: [] } });
    expect(provider.reviews).toEqual([]);
    expect(provider.statusComments).toEqual([]);
  });

  it.each([
    ['default', {}, 'gpt-6-luna'],
    ['Luna', { 'reviewer-model': 'gpt-6-luna', 'reviewer-effort': 'low' }, 'gpt-6-luna'],
    ['Sol', { 'reviewer-model': 'gpt-6.1-sol', 'reviewer-effort': 'low' }, 'gpt-6.1-sol'],
    ['another compatible model', { 'reviewer-model': 'another-compatible-model' }, 'another-compatible-model'],
  ] as const)('uses the same effective %s configuration for detection and verification', async (_name, inputs, model) => {
    const provider = new InMemoryReviewProvider();
    const query = detector([finding()]);
    const verify = jest.fn<ReturnType<BugbotShadowVerificationPort['verify']>, Parameters<BugbotShadowVerificationPort['verify']>>().mockResolvedValue({
      status: 'verdict', verdict: 'inconclusive', reason: 'The caller was not established.',
      missing: 'Identify the caller at the pinned commit.', citations: [], reportedModel: model,
    });
    const operation = projectBugbotReviewOperationContext(execution('dry-run', [], inputs));
    const results = await new DetectPotentialProblemsUseCase({ query }, scmPorts(provider), undefined, undefined, { verify })
      .invoke(operation);

    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][0].configuration).toBe(query.mock.calls[0][0].configuration);
    expect(verify.mock.calls[0][0].configuration.model).toBe(model);
    expect(verify.mock.calls[0][0].candidate).toEqual({
      id: 'unchecked-token', hypothesis: 'Unchecked token',
      anchor: { path: 'src/auth.ts', line: 10, end: 10, side: 'RIGHT' },
      repository: { owner: 'org', name: 'repo' }, pullRequest: 7, headSha: provider.headSha, allowBase: false,
    });
    expect(results[0].payload).toMatchObject({ findings: [{ id: 'unchecked-token' }],
      bugbotShadowVerification: { resolvedModel: model, candidates: [{ status: 'verdict', verdict: 'inconclusive', reportedModel: model }] } });
    expect(provider.reviews).toEqual([]);
    expect(provider.statusComments).toEqual([]);
  });

  it.each(['transport failure', 'reported model mismatch'])('keeps the normal native publication on %s', async (fault) => {
    const baseline = new InMemoryReviewProvider();
    const observed = new InMemoryReviewProvider();
    const operation = projectBugbotReviewOperationContext(execution('publish', [], { 'reviewer-model': 'gpt-6.1-sol' }));
    const verify = jest.fn<ReturnType<BugbotShadowVerificationPort['verify']>, Parameters<BugbotShadowVerificationPort['verify']>>().mockImplementation(async () => {
      expect(observed.reviews).toHaveLength(0);
      if (fault === 'transport failure') throw new Error('provider failed');
      return { status: 'verdict', verdict: 'inconclusive', reason: 'The caller was not established.',
        missing: 'Identify the caller.', citations: [], reportedModel: 'other-model' };
    });
    const query = detector([finding()]);
    await new DetectPotentialProblemsUseCase({ query }, scmPorts(baseline)).invoke(operation);
    const result = await new DetectPotentialProblemsUseCase({ query }, scmPorts(observed), undefined, undefined, { verify }).invoke(operation);

    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0][0].configuration.model).toBe('gpt-6.1-sol');
    expect(baseline.reviews).toHaveLength(1);
    expect(observed.reviews.map(review => review.comments)).toEqual(baseline.reviews.map(review => review.comments));
    expect(observed.threadStates).toEqual(baseline.threadStates);
    expect(result[0].payload).toMatchObject({ bugbotShadowVerification: {
      resolvedModel: 'gpt-6.1-sol', candidates: [{ status: 'technical-failure',
        reason: fault === 'transport failure' ? 'verifier-unavailable' : 'reported-model-mismatch' }],
    } });
  });
});
