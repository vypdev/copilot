import { TimerDelayAdapter } from '../timer_delay_adapter';

describe('TimerDelayAdapter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves after the requested delay', async () => {
    const delay = new TimerDelayAdapter();
    let completed = false;
    const pending = delay.wait(250).then(() => {
      completed = true;
    });

    await jest.advanceTimersByTimeAsync(249);
    expect(completed).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(completed).toBe(true);
  });
});
