import { TimerWorkflowPollingDelayAdapter } from '../timer_workflow_polling_delay_adapter';

describe('TimerWorkflowPollingDelayAdapter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves after the requested delay', async () => {
    const adapter = new TimerWorkflowPollingDelayAdapter();
    const waiting = adapter.wait(25);

    await jest.advanceTimersByTimeAsync(25);

    await expect(waiting).resolves.toBeUndefined();
  });
});
