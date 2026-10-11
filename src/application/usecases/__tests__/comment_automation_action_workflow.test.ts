import { runCommentAutomationAction } from '../comment_automation_action_workflow';
import { Result } from '../../../data/model/result';

const mockCommitAutofix = jest.fn();
const mockCommitUserRequest = jest.fn();
jest.mock('../steps/commit/bugbot/commit_user_request_workflow', () => ({
  commitUserRequestIfSuccessful: (...args: unknown[]) => mockCommitUserRequest(...args),
}));
jest.mock('../steps/commit/bugbot/commit_autofix_and_resolve_workflow', () => ({
  commitAutofixAndResolveFindings: (...args: unknown[]) => mockCommitAutofix(...args),
}));

function options(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'CommentAutomation',
    ...overrides,
  } as never;
}

function execution(publicationMode: 'publish' | 'dry-run' = 'publish') {
  return {
    userComment: '@vypbot analyze this',
    bugbot: {
      publicationMode,
      review: {},
      autofix: {},
      commit: {},
    },
  } as never;
}

describe('runCommentAutomationAction', () => {
  beforeEach(() => {
    mockCommitAutofix.mockReset().mockResolvedValue([]);
    mockCommitUserRequest.mockReset().mockResolvedValue([]);
  });
  it('fails clearly when the read-only review route is not composed', async () => {
    const results = await runCommentAutomationAction(
      {} as never,
      options(),
      'review',
      undefined,
    );

    expect(results[0]).toMatchObject({
      id: 'CommentAutomation.Review',
      success: false,
      executed: false,
    });
  });

  it('does not perform an action for the think route', async () => {
    await expect(runCommentAutomationAction(
      {} as never,
      options(),
      'think',
      undefined,
    )).resolves.toEqual([]);
  });

  it('runs an independent review after a successful autofix commit path', async () => {
    const reviewResult = new Result({ id: 'review', success: true, executed: true });
    const review = { invoke: jest.fn().mockResolvedValue([reviewResult]) };
    const autofix = { invoke: jest.fn().mockResolvedValue([new Result({ id: 'autofix', success: true, executed: true })]) };
    const results = await runCommentAutomationAction(
      execution(),
      options({ autofixUseCase: autofix, reviewPotentialProblemsUseCase: review }),
      'autofix',
      { targetFindingIds: ['finding-1'] } as never,
    );

    expect(mockCommitAutofix).toHaveBeenCalledTimes(1);
    expect(review.invoke).toHaveBeenCalledTimes(1);
    expect(results.at(-1)).toBe(reviewResult);
  });

  it('blocks autofix mutations in global dry-run mode', async () => {
    const autofix = { invoke: jest.fn() };
    const results = await runCommentAutomationAction(
      execution('dry-run'),
      options({ autofixUseCase: autofix }),
      'autofix',
      { targetFindingIds: ['finding-1'] } as never,
    );

    expect(autofix.invoke).not.toHaveBeenCalled();
    expect(mockCommitAutofix).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, executed: false, payload: { dryRun: true } });
  });

  it('retries a superseded post-push review once and retains only the fresh canonical result', async () => {
    const superseded = new Result({ id: 'review', success: true, executed: true, payload: { superseded: true, analyzedHeadSha: 'old-head' } });
    const verified = new Result({ id: 'review', success: true, executed: true, payload: { analyzedHeadSha: 'pushed-head' } });
    const review = { invoke: jest.fn().mockResolvedValueOnce([superseded]).mockResolvedValueOnce([verified]) };
    const autofix = { invoke: jest.fn().mockResolvedValue([new Result({ id: 'autofix', success: true, executed: true })]) };
    const context = execution();

    const results = await runCommentAutomationAction(context, options({ autofixUseCase: autofix, reviewPotentialProblemsUseCase: review }), 'autofix', { targetFindingIds: ['finding-1'] } as never);

    expect(review.invoke).toHaveBeenCalledTimes(2);
    expect(review.invoke.mock.calls[0][0]).toBe(review.invoke.mock.calls[1][0]);
    expect(autofix.invoke).toHaveBeenCalledTimes(1);
    expect(mockCommitAutofix).toHaveBeenCalledTimes(1);
    expect(results).toContain(verified);
    expect(results).not.toContain(superseded);
  });

  it('stops after a second superseded review without repeating any write or declaring a clean result', async () => {
    const superseded = new Result({ id: 'review', success: true, executed: true, payload: { superseded: true } });
    const review = { invoke: jest.fn().mockResolvedValue([superseded]) };
    const autofix = { invoke: jest.fn().mockResolvedValue([new Result({ id: 'autofix', success: true, executed: true })]) };

    const results = await runCommentAutomationAction(execution(), options({ autofixUseCase: autofix, reviewPotentialProblemsUseCase: review }), 'autofix', { targetFindingIds: ['finding-1'] } as never);

    expect(review.invoke).toHaveBeenCalledTimes(2);
    expect(mockCommitAutofix).toHaveBeenCalledTimes(1);
    expect(autofix.invoke).toHaveBeenCalledTimes(1);
    expect(results.filter(result => result === superseded)).toHaveLength(1);
    expect(results.at(-1)?.payload).toEqual({ superseded: true });
  });

  it.each([
    { success: false, executed: true, payload: { superseded: true } },
    { success: true, executed: false, payload: { superseded: true } },
    { success: true, executed: true, payload: { partial: true } },
    { success: true, executed: true, payload: null },
    { success: true, executed: true, payload: [] },
  ])('does not retry failed, unexecuted or partial post-push evidence: %j', async data => {
    const result = new Result({ id: 'review', ...data });
    const review = { invoke: jest.fn().mockResolvedValue([result]) };
    const autofix = { invoke: jest.fn().mockResolvedValue([new Result({ id: 'autofix', success: true, executed: true })]) };

    const results = await runCommentAutomationAction(execution(), options({ autofixUseCase: autofix, reviewPotentialProblemsUseCase: review }), 'autofix', { targetFindingIds: ['finding-1'] } as never);

    expect(review.invoke).toHaveBeenCalledTimes(1);
    expect(results.at(-1)).toBe(result);
  });
});


describe('implementation conversation branch authority', () => {
  beforeEach(() => mockCommitUserRequest.mockReset().mockResolvedValue([]));
  function fixture(pr = false) {
    const branch = 'feature/42-managed';
    const target = {
      userComment: '/copilot implement Add the accepted feature',
      status: { target: pr ? 'pull-request' : 'issue', branch },
      bugbot: { commit: {}, fixIntent: {
        repository: { owner: 'o', name: 'r' },
        target: { isPullRequest: pr, issueNumber: 42, pullRequestNumber: 77, headBranch: branch },
        trigger: { kind: 'issue_comment', headOwner: 'o' }, ignorePatterns: [], organizationRules: [],
      } },
    };
    const invoke = jest.fn().mockResolvedValue([new Result({ id: 'implementation', success: true, executed: true })]);
    const linked = jest.fn().mockResolvedValue({ name: branch, headSha: 'a'.repeat(40) });
    const candidate = { number: 77, state: 'open', draft: false, baseRepository: { owner: 'o', name: 'r' },
      headRepositoryOwner: 'o', headRepositoryName: 'r', headRef: branch, headSha: 'a'.repeat(40) };
    const getPullRequest = jest.fn().mockResolvedValue(candidate);
    const opts = { taskId: 'CommentAutomation', doUserRequestUseCase: { invoke },
      rememberBranchPorts: { linkedBranches: { getLinkedBranch: linked }, pullRequests: { getPullRequest } },
      bugbotGitMutationPort: {},
    };
    const intent = { isDoRequest: true, requestText: 'Add the accepted feature', targetFindingIds: [] };
    const run = () => runCommentAutomationAction(target as never, opts as never, 'do-user-request', intent as never);
    return { branch, target, invoke, linked, candidate, getPullRequest, opts, intent, run };
  }

  it('passes the exact verified linked issue branch to both implementation and commit', async () => {
    const h = fixture();
    await h.run();
    expect(h.linked).toHaveBeenCalledWith(42, h.branch);
    expect(h.invoke).toHaveBeenCalledWith({ userComment: 'Add the accepted feature', branchOverride: h.branch });
    expect(mockCommitUserRequest.mock.calls[0][1]).toBe(h.branch);
    expect(h.getPullRequest).not.toHaveBeenCalled();
  });

  it('resolves a PR conversation through its exact current canonical identity', async () => {
    const h = fixture(true);
    await h.run();
    expect(h.getPullRequest).toHaveBeenCalledWith(77);
    expect(h.invoke).toHaveBeenCalledWith(expect.objectContaining({ branchOverride: h.branch }));
    expect(mockCommitUserRequest.mock.calls[0][1]).toBe(h.branch);
    expect(h.linked).not.toHaveBeenCalled();
  });

  it.each(['missing', 'wrong-ref', 'invalid-sha', 'denied', 'no-port'])('blocks %s branch evidence before the agent or commit', async mode => {
    const h = fixture();
    if (mode === 'missing') h.linked.mockResolvedValue(undefined);
    if (mode === 'wrong-ref') h.linked.mockResolvedValue({ name: 'feature/foreign', headSha: 'a'.repeat(40) });
    if (mode === 'invalid-sha') h.linked.mockResolvedValue({ name: h.branch, headSha: 'malformed' });
    if (mode === 'denied') h.linked.mockRejectedValue(new Error('Denied'));
    if (mode === 'no-port') Object.assign(h.opts, { rememberBranchPorts: undefined });
    expect((await h.run())[0]).toMatchObject({ success: false, executed: false });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(mockCommitUserRequest).not.toHaveBeenCalled();
  });

  it('rejects an intent branch that disagrees with the verified conversation target', async () => {
    const h = fixture();
    Object.assign(h.intent, { branchOverride: 'master' });
    expect((await h.run())[0].errors?.[0].code).toBe('workflow.stale');
    expect(h.invoke).not.toHaveBeenCalled();
    expect(mockCommitUserRequest).not.toHaveBeenCalled();
  });

  it.each([{ headRepositoryOwner: 'fork-owner' }, { headRepositoryName: 'fork-repo' }, { number: 78 }])(
    'rejects foreign PR authority before implementation: %j', async override => {
      const h = fixture(true);
      h.getPullRequest.mockResolvedValue({ ...h.candidate, ...override });
      expect((await h.run())[0]).toMatchObject({ success: false, executed: false });
      expect(h.invoke).not.toHaveBeenCalled();
      expect(mockCommitUserRequest).not.toHaveBeenCalled();
    },
  );
});
