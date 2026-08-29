import {
    clearAccumulatedLogs,
    configureApplicationLogger,
    getAccumulatedLogsAsText,
    logError,
    logInfo,
    resetApplicationLogger,
} from '../logging_ports';

describe('application logging port', () => {
    afterEach(() => resetApplicationLogger());

    it('delegates semantic log records to the configured runtime', () => {
        const logger = {
            logInfo: jest.fn(),
            logWarn: jest.fn(),
            logWarning: jest.fn(),
            logError: jest.fn(),
            logDebugInfo: jest.fn(),
            logDebugWarning: jest.fn(),
            logDebugError: jest.fn(),
            setGlobalLoggerDebug: jest.fn(),
            getAccumulatedLogEntries: jest.fn().mockReturnValue([]),
            getAccumulatedLogsAsText: jest.fn().mockReturnValue('logs'),
            clearAccumulatedLogs: jest.fn(),
        };

        configureApplicationLogger(logger);
        logInfo('message');
        logError('failure');
        clearAccumulatedLogs();

        expect(logger.logInfo).toHaveBeenCalledWith('message', false, undefined, undefined);
        expect(logger.logError).toHaveBeenCalledWith('failure', undefined);
        expect(logger.clearAccumulatedLogs).toHaveBeenCalledTimes(1);
        expect(getAccumulatedLogsAsText()).toBe('logs');
    });
});
