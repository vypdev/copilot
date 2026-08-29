import { createLoggerAdapter } from '../logger_adapter';

jest.mock('../../../utils/logger', () => ({
    clearAccumulatedLogs: jest.fn(),
    getAccumulatedLogEntries: jest.fn(),
    getAccumulatedLogsAsText: jest.fn(),
    logDebugError: jest.fn(),
    logDebugInfo: jest.fn(),
    logDebugWarning: jest.fn(),
    logError: jest.fn(),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
    logWarning: jest.fn(),
    setGlobalLoggerDebug: jest.fn(),
}));

describe('logger adapter', () => {
    it('exposes the runtime logger through the application port', () => {
        const runtimeLogger = require('../../../utils/logger') as Record<string, jest.Mock>;
        const adapter = createLoggerAdapter();

        expect(adapter.logInfo).toBe(runtimeLogger.logInfo);
        expect(adapter.logError).toBe(runtimeLogger.logError);
        expect(adapter.clearAccumulatedLogs).toBe(runtimeLogger.clearAccumulatedLogs);
        expect(adapter.getAccumulatedLogsAsText).toBe(runtimeLogger.getAccumulatedLogsAsText);
    });
});
