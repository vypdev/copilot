import { logDebugInfo, logInfo } from '../../../utils/logger';
import { LoggerWorkflowPollingObserverAdapter } from '../logger_workflow_polling_observer_adapter';

jest.mock('../../../utils/logger', () => ({
  logDebugInfo: jest.fn(),
  logInfo: jest.fn(),
}));

describe('LoggerWorkflowPollingObserverAdapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports the idle and waiting polling states with the current messages', () => {
    const observer = new LoggerWorkflowPollingObserverAdapter();

    observer.noActivePreviousRuns();
    observer.nativeCoordinationVerified();
    observer.waitingForPreviousRuns(2, 2000);

    expect(logDebugInfo).toHaveBeenNthCalledWith(1, '✅ No previous runs active. Continuing...');
    expect(logInfo).toHaveBeenCalledWith('Native workflow resource/lane coordination verified; continuing before setup.');
    expect(logInfo).toHaveBeenCalledWith(
      '⏳ Found 2 previous run(s) still active. Waiting 2s...',
    );
  });

  it.each([
    { reason: 'transient' as const, attempt: 1, delayMilliseconds: 1000 },
    { reason: 'rate_limit' as const, attempt: 2, delayMilliseconds: 2000, resetEpochSeconds: 1700000000 },
  ])('reports bounded retry metadata for $reason', observation => {
    new LoggerWorkflowPollingObserverAdapter().providerRetry(observation);

    expect(logDebugInfo).toHaveBeenCalledWith('GitHub workflow polling retry scheduled.', false, observation);
    expect(logInfo).not.toHaveBeenCalled();
  });
});
