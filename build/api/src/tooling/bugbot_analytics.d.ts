import type { BugbotReviewOutcome, BugbotReviewTelemetrySnapshot } from '../application/ports/bugbot_telemetry_ports';
export interface BugbotAnalyticsReport {
    readonly reviews: number;
    readonly outcomes: Readonly<Record<BugbotReviewOutcome, number>>;
    /** Fraction of runs that did not fail, including intentional skips and superseded revisions. */
    readonly nonFailureRate: number;
    /** Fraction of actionable runs that completed analysis (skips and superseded revisions excluded). */
    readonly reviewCompletionRate: number;
    readonly latencyMs: {
        readonly p50: number;
        readonly p95: number;
        readonly maximum: number;
    };
    readonly averageCandidateFindings: number;
    readonly averagePublishedFindings: number;
    readonly resolutionEvents: number;
    readonly findingStateObservations: Readonly<Record<'open' | 'fixed' | 'obsolete' | 'dismissed' | 'reopened', number>>;
    readonly estimatedInputTokens: number;
    readonly estimatedOutputTokens: number;
    readonly stageP95Ms: Readonly<Record<string, number>>;
}
/** Aggregates content-free telemetry. Empty input is valid and produces a zero report. */
export declare function buildBugbotAnalytics(snapshots: readonly BugbotReviewTelemetrySnapshot[]): BugbotAnalyticsReport;
export declare function parseBugbotTelemetry(input: string): BugbotReviewTelemetrySnapshot[];
