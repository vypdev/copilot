import { TimerBranchPropagationDelayAdapter } from "../timer_branch_propagation_delay_adapter";

describe("TimerBranchPropagationDelayAdapter", () => {
  afterEach(() => jest.useRealTimers());

  it("resolves only after the configured propagation interval", async () => {
    jest.useFakeTimers();
    const adapter = new TimerBranchPropagationDelayAdapter(250);
    const completed = jest.fn();

    const waiting = adapter.waitForLinkedBranch().then(completed);
    await jest.advanceTimersByTimeAsync(249);
    expect(completed).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it("uses ten seconds as the production default", async () => {
    jest.useFakeTimers();
    const adapter = new TimerBranchPropagationDelayAdapter();
    const completed = jest.fn();

    const waiting = adapter.waitForLinkedBranch().then(completed);
    await jest.advanceTimersByTimeAsync(9_999);
    expect(completed).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(completed).toHaveBeenCalledTimes(1);
  });
});
