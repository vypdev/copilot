import { runCommentAutomationAction } from '../comment_automation_action_workflow';
import { Result } from '../../../data/model/result';

const mockCommitAutofix = jest.fn();
jest.mock('../steps/commit/bugbot/commit_autofix_and_resolve_workflow', () => ({
  commitAutofixAndResolveFindings: (...args: unknown[]) => mockCommitAutofix(...args),
}));

function options(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'CommentAutomation',
    userComment: '@vypbot analyze this',
    ...overrides,
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
      {} as never,
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
      {} as never,
    )).resolves.toEqual([]);
  });

  it('runs an independent review after a successful autofix commit path', async () => {
    const reviewResult = new Result({ id: 'review', success: true, executed: true });
    const review = { invoke: jest.fn().mockResolvedValue([reviewResult]) };
    const autofix = { invoke: jest.fn().mockResolvedValue([new Result({ id: 'autofix', success: true, executed: true })]) };
    const results = await runCommentAutomationAction(
      { ai: { getBugbotReviewConfiguration: () => ({ publicationMode: 'publish' }) } } as never,
      options({ autofixUseCase: autofix, reviewPotentialProblemsUseCase: review }),
      'autofix',
      { targetFindingIds: ['finding-1'] } as never,
      {} as never,
    );

    expect(mockCommitAutofix).toHaveBeenCalledTimes(1);
    expect(review.invoke).toHaveBeenCalledTimes(1);
    expect(results.at(-1)).toBe(reviewResult);
  });

  it('blocks autofix mutations in global dry-run mode', async () => {
    const autofix = { invoke: jest.fn() };
    const results = await runCommentAutomationAction(
      { ai: { getBugbotReviewConfiguration: () => ({ publicationMode: 'dry-run' }) } } as never,
      options({ autofixUseCase: autofix }),
      'autofix',
      { targetFindingIds: ['finding-1'] } as never,
      {} as never,
    );

    expect(autofix.invoke).not.toHaveBeenCalled();
    expect(mockCommitAutofix).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, executed: false, payload: { dryRun: true } });
  });
});
