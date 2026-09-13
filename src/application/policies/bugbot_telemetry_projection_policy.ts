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
    if (!telemetry) return undefined;
    if (telemetry.schemaVersion !== 1) return undefined;
    if (!isBugbotReviewOutcome(telemetry.outcome)) return undefined;
    if (!isFiniteNumber(telemetry.elapsedMs)) return undefined;
    const configuredEffort = normalizeNonEmptyString(telemetry.configuredEffort) ?? 'default';
    const headSha = normalizeNonEmptyString(telemetry.headSha);
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
    const telemetryResults = results.filter((result) => hasBugbotTelemetryField(result.payload));
    if (telemetryResults.length !== 1) return undefined;
    return projectBugbotTelemetry(telemetryResults[0].payload);
}

function isBugbotReviewOutcome(value: unknown): value is BugbotReviewOutcome {
    return typeof value === 'string' && BUGBOT_REVIEW_OUTCOMES.includes(value as BugbotReviewOutcome);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function normalizeNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value.trim() || undefined;
}

function hasBugbotTelemetryField(value: unknown): boolean {
    const payload = getResultPayload(value);
    return payload !== undefined && Object.prototype.hasOwnProperty.call(payload, 'bugbotTelemetry');
}
