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
    observer.waitingForPreviousRuns(2, 2000);

    expect(logDebugInfo).toHaveBeenNthCalledWith(1, '✅ No previous runs active. Continuing...');
    expect(logInfo).toHaveBeenCalledWith(
      '⏳ Found 2 previous run(s) still active. Waiting 2s...',
    );
  });
});
