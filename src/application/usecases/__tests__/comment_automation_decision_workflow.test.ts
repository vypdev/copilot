import { Result } from '../../../data/model/result';
import { resolveCommentAutomationDecision } from '../comment_automation_decision_workflow';
import type { CommentAutomationContext } from '../comment_automation_context';
import type { CommentAutomationOptions } from '../comment_automation_contracts';

describe('conversation mutation branch authority', () => {
  it.each(['do-user-request', 'autofix'] as const)('keeps a branchless help issue read-only despite classified %s intent', async route => {
    const decision = await resolveCommentAutomationDecision({
      actor: 'maintainer', trustedBotLogin: 'copilot', userComment: '@copilot inspect the repository',
      status: { target: 'issue' }, bugbot: { fixIntent: {} },
    } as CommentAutomationContext, {
      intentUseCase: { invoke: jest.fn().mockResolvedValue([new Result({
        id: 'intent', success: true, executed: true, payload: {
          isDoRequest: route === 'do-user-request', isFixRequest: route === 'autofix',
          targetFindingIds: ['finding'], context: {},
        },
      })]) },
    } as unknown as CommentAutomationOptions, {
      isActorAllowedToModifyFiles: jest.fn().mockResolvedValue(true),
    } as never);
    expect(decision.route).toBe('think');
  });
});
