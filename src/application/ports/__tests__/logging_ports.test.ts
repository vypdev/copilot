import {
    configureApplicationLogger,
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
        };

        configureApplicationLogger(logger);
        logInfo('message');
        logError('failure');

        expect(logger.logInfo).toHaveBeenCalledWith('message', false, undefined, undefined);
        expect(logger.logError).toHaveBeenCalledWith('failure', undefined);
    });
});
