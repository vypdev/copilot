export interface ApplicationLogEntry {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

/**
 * Semantic logging capability required by application workflows.
 *
 * The application knows how to report progress and failures, but not how
 * those records are rendered by a runtime. Infrastructure installs the
 * concrete implementation at the lifecycle boundary.
 */
export interface ApplicationLoggingPort {
    logInfo(
        message: string,
        previousWasSingleLine?: boolean,
        metadata?: Record<string, unknown>,
        skipAccumulation?: boolean,
    ): void;
    logWarn(message: string, metadata?: Record<string, unknown>): void;
    logWarning(message: string): void;
    logError(message: unknown, metadata?: Record<string, unknown>): void;
    logDebugInfo(message: string, previousWasSingleLine?: boolean, metadata?: Record<string, unknown>): void;
    logDebugWarning(message: string): void;
    logDebugError(message: unknown): void;
    setGlobalLoggerDebug(debug: boolean, isRemote?: boolean): void;
}

/**
 * Separate output/report capability used by the outer lifecycle when it
 * needs to publish accumulated diagnostics. Application use cases should
 * not depend on report storage just to log a message.
 */
export interface ApplicationLogReportPort {
    getAccumulatedLogEntries(): ApplicationLogEntry[];
    getAccumulatedLogsAsText(): string;
    clearAccumulatedLogs(): void;
}

const noopLogger: ApplicationLoggingPort = {
    logInfo: () => undefined,
    logWarn: () => undefined,
    logWarning: () => undefined,
    logError: () => undefined,
    logDebugInfo: () => undefined,
    logDebugWarning: () => undefined,
    logDebugError: () => undefined,
    setGlobalLoggerDebug: () => undefined,
};

let activeLogger: ApplicationLoggingPort = noopLogger;

/** Installs the runtime logger for one application lifecycle. */
export function configureApplicationLogger(logger: ApplicationLoggingPort): void {
    activeLogger = logger;
}

/** Restores the side-effect-free default, primarily useful for isolated runs and tests. */
export function resetApplicationLogger(): void {
    activeLogger = noopLogger;
}

export function logInfo(
    message: string,
    previousWasSingleLine = false,
    metadata?: Record<string, unknown>,
    skipAccumulation?: boolean,
): void {
    activeLogger.logInfo(message, previousWasSingleLine, metadata, skipAccumulation);
}

export function logWarn(message: string, metadata?: Record<string, unknown>): void {
    activeLogger.logWarn(message, metadata);
}

export function logWarning(message: string): void {
    activeLogger.logWarning(message);
}

export function logError(message: unknown, metadata?: Record<string, unknown>): void {
    activeLogger.logError(message, metadata);
}

export function logDebugInfo(message: string, previousWasSingleLine = false, metadata?: Record<string, unknown>): void {
    activeLogger.logDebugInfo(message, previousWasSingleLine, metadata);
}

export function logDebugWarning(message: string): void {
    activeLogger.logDebugWarning(message);
}

export function logDebugError(message: unknown): void {
    activeLogger.logDebugError(message);
}

export function setGlobalLoggerDebug(debug: boolean, isRemote = false): void {
    activeLogger.setGlobalLoggerDebug(debug, isRemote);
}
