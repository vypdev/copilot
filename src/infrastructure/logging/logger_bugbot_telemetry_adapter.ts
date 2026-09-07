import type { BugbotReviewTelemetrySnapshot, BugbotTelemetryPort } from '../../application/ports/bugbot_telemetry_ports';
import { logInfo } from '../../application/ports/logging_ports';

export class LoggerBugbotTelemetryAdapter implements BugbotTelemetryPort {
    publish(snapshot: BugbotReviewTelemetrySnapshot): void {
        logInfo(`[bugbot.telemetry] ${JSON.stringify(snapshot)}`);
    }
}
