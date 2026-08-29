import type { ApplicationLoggingPort } from '../../application/ports/logging_ports';
import {
    clearAccumulatedLogs,
    getAccumulatedLogEntries,
    getAccumulatedLogsAsText,
    logDebugError,
    logDebugInfo,
    logDebugWarning,
    logError,
    logInfo,
    logWarn,
    logWarning,
    setGlobalLoggerDebug,
} from '../../utils/logger';

/** Adapts the process/GitHub logger to the semantic application port. */
export function createLoggerAdapter(): ApplicationLoggingPort {
    return {
        logInfo,
        logWarn,
        logWarning,
        logError,
        logDebugInfo,
        logDebugWarning,
        logDebugError,
        setGlobalLoggerDebug,
        getAccumulatedLogEntries,
        getAccumulatedLogsAsText,
        clearAccumulatedLogs,
    };
}
