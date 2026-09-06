import type { BugbotReviewTelemetrySnapshot, BugbotTelemetryPort } from '../../application/ports/bugbot_telemetry_ports';
export declare class LoggerBugbotTelemetryAdapter implements BugbotTelemetryPort {
    publish(snapshot: BugbotReviewTelemetrySnapshot): void;
}
