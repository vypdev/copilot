import { shouldTrackAgentActivity, type AgentActivityExecutionContext } from '../agent_activity_policy';
describe('doctor query leaves agent activity untouched', () => {
  it.each(['issue-comment', 'pull-request-review-comment'] as const)('does not inspect agent configuration on %s', route => {
    const readAgent = jest.fn(() => ({ model: 'available-model' }));
    const execution = { eventName: route === 'issue-comment' ? 'issue_comment' : 'pull_request_review_comment',
      issueNumber: 7, issue: { number: 7, commentBody: '/copilot doctor' },
      pullRequest: { number: 9, commentBody: '/copilot doctor' }, ai: { getAgentConfiguration: readAgent } } as unknown as AgentActivityExecutionContext;
    expect(shouldTrackAgentActivity(execution, route)).toBe(false);
    expect(readAgent).not.toHaveBeenCalled();
  });
});
