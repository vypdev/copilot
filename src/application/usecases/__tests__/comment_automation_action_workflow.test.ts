import { runCommentAutomationAction } from '../comment_automation_action_workflow';

function options(overrides: Record<string, unknown> = {}) {
  return {
    taskId: 'CommentAutomation',
    userComment: '@vypbot analyze this',
    ...overrides,
  } as never;
}

describe('runCommentAutomationAction', () => {
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
});
