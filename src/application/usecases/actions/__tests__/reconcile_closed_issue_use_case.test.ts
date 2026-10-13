import { ReconcileClosedIssueUseCase } from '../reconcile_closed_issue_use_case';
import { Result } from '../../../../data/model/result';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';

it.each([true, false])('retains metadata outcome and still retires cards after partial repair (%s)', async success => {
    const first = new Result({ id: 'metadata', success, executed: true });
    const second = new Result({ id: 'cards', success: true, executed: true });
    const metadata = { taskId: 'metadata', invoke: jest.fn(async () => [first]) };
    const cards = { taskId: 'cards', invoke: jest.fn(async () => [second]) };
    const context = { issueNumber: 42, locale: 'en-US', trustedBotLogin: 'bot', completionLabels: {
        lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS, protectedLabels: ['branched', 'SDD'] } };
    expect(await new ReconcileClosedIssueUseCase(metadata, cards).invoke(context)).toEqual([first, second]);
    expect(metadata.invoke.mock.invocationCallOrder[0]).toBeLessThan(cards.invoke.mock.invocationCallOrder[0]);
    expect(cards.invoke).toHaveBeenCalledWith(context);
});
