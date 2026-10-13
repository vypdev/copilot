import { Result } from '../../../../data/model/result';
import { RetireClosedIssueCardsUseCase } from '../retire_closed_issue_cards_use_case';
it.each([true, false])('retains synchronization outcome and still retires progress after partial result (%s)', async success => {
  const first = new Result({ id: 'sync', success, executed: true });
  const second = new Result({ id: 'progress', success: true, executed: true });
  const sync = { taskId: 'sync', invoke: jest.fn(async () => [first]) };
  const progress = { taskId: 'progress', invoke: jest.fn(async () => [second]) };
  const context = { issueNumber: 42, locale: 'es-ES', trustedBotLogin: 'bot' };
  const result = await new RetireClosedIssueCardsUseCase(sync, progress).invoke(context);
  expect(result).toEqual([first, second]); expect(progress.invoke).toHaveBeenCalledWith(context);
  expect(sync.invoke.mock.invocationCallOrder[0]).toBeLessThan(progress.invoke.mock.invocationCallOrder[0]);
});
