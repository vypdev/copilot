import { runCommentAutomationAction } from '../comment_automation_action_workflow';
import { Result } from '../../../data/model/result';

const mockCommitAutofix = jest.fn();
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
  beforeEach(() => mockCommitAutofix.mockReset().mockResolvedValue([]));
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
