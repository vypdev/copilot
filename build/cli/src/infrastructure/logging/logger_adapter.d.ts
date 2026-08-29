import type { ApplicationLogReportPort, ApplicationLoggingPort } from '../../application/ports/logging_ports';
/** Adapts the process/GitHub logger to the semantic application port. */
export declare function createLoggerAdapter(): ApplicationLoggingPort;
export declare function createLogReportAdapter(): ApplicationLogReportPort;
