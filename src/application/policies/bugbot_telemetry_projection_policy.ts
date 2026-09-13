import type { Result } from '../../data/model/result';
import { getResultPayload } from '../../data/model/result';
import type { BugbotReviewOutcome } from '../ports/bugbot_telemetry_ports';

const BUGBOT_REVIEW_OUTCOMES: readonly BugbotReviewOutcome[] = [
    'completed',
    'no-findings',
    'partial',
    'dry-run',
    'superseded',
    'skipped',
    'failed',
];

export interface BugbotTelemetryProjection {
    readonly schemaVersion: 1;
    readonly outcome: BugbotReviewOutcome;
    readonly elapsedMs: number;
    readonly configuredEffort: string;
    readonly headSha?: string;
}

/** Projects only the trusted, content-free telemetry facts used by result presentation. */
export function projectBugbotTelemetry(value: unknown): BugbotTelemetryProjection | undefined {
    const telemetry = getResultPayload(getResultPayload(value)?.bugbotTelemetry);
    if (!telemetry || telemetry.schemaVersion !== 1 || !isBugbotReviewOutcome(telemetry.outcome)
        || typeof telemetry.elapsedMs !== 'number' || !Number.isFinite(telemetry.elapsedMs)) {
        return undefined;
    }
    const configuredEffort = typeof telemetry.configuredEffort === 'string' && telemetry.configuredEffort.trim()
        ? telemetry.configuredEffort.trim()
        : 'default';
    const headSha = typeof telemetry.headSha === 'string' && telemetry.headSha.trim()
        ? telemetry.headSha.trim()
        : undefined;
    return {
        schemaVersion: 1,
        outcome: telemetry.outcome,
        elapsedMs: Math.max(0, telemetry.elapsedMs),
        configuredEffort,
        ...(headSha ? { headSha } : {}),
    };
}

/** Accepts exactly one semantic review snapshot; ambiguous result sets fail closed. */
export function selectBugbotTelemetry(results: readonly Result[]): BugbotTelemetryProjection | undefined {
    const snapshots = results.flatMap((result) => {
        const projected = projectBugbotTelemetry(result.payload);
        return projected ? [projected] : [];
    });
    return snapshots.length === 1 ? snapshots[0] : undefined;
}

function isBugbotReviewOutcome(value: unknown): value is BugbotReviewOutcome {
    return typeof value === 'string' && BUGBOT_REVIEW_OUTCOMES.includes(value as BugbotReviewOutcome);
}
