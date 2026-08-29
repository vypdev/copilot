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
    logInfo(message: string, previousWasSingleLine?: boolean, metadata?: Record<string, unknown>, skipAccumulation?: boolean): void;
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
export interface ApplicationLogReportReaderPort {
    getAccumulatedLogsAsText(): string;
}
export interface ApplicationLogReportPort extends ApplicationLogReportReaderPort {
    getAccumulatedLogEntries(): ApplicationLogEntry[];
    clearAccumulatedLogs(): void;
}
/** Installs the runtime logger for one application lifecycle. */
export declare function configureApplicationLogger(logger: ApplicationLoggingPort): void;
/** Restores the side-effect-free default, primarily useful for isolated runs and tests. */
export declare function resetApplicationLogger(): void;
export declare function logInfo(message: string, previousWasSingleLine?: boolean, metadata?: Record<string, unknown>, skipAccumulation?: boolean): void;
export declare function logWarn(message: string, metadata?: Record<string, unknown>): void;
export declare function logWarning(message: string): void;
export declare function logError(message: unknown, metadata?: Record<string, unknown>): void;
export declare function logDebugInfo(message: string, previousWasSingleLine?: boolean, metadata?: Record<string, unknown>): void;
export declare function logDebugWarning(message: string): void;
export declare function logDebugError(message: unknown): void;
export declare function setGlobalLoggerDebug(debug: boolean, isRemote?: boolean): void;
