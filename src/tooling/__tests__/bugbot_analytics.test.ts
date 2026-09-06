import { buildBugbotAnalytics, parseBugbotTelemetry } from '../bugbot_analytics';
import type { BugbotReviewTelemetrySnapshot } from '../../application/ports/bugbot_telemetry_ports';

function snapshot(elapsedMs: number, outcome: BugbotReviewTelemetrySnapshot['outcome']): BugbotReviewTelemetrySnapshot {
    return {
        schemaVersion: 1, reviewId: String(elapsedMs), repository: 'o/r', publicationMode: 'publish', configuredEffort: 'smart',
        startedAt: '2026-01-01T00:00:00.000Z', elapsedMs, stagesMs: { analysis: elapsedMs / 2 }, promptCharacters: 40,
        responseCharacters: 20, estimatedInputTokens: 10, estimatedOutputTokens: 5, changedFiles: 1, changedLines: 4,
        rulesLoaded: 1, candidateFindings: 2, publishedFindings: outcome === 'completed' ? 1 : 0, overflowFindings: 0,
        resolvedFindings: 1, findingStates: { open: 0, fixed: 1, obsolete: 0, dismissed: 0, reopened: 0 }, outcome,
    };
}

describe('Bugbot analytics', () => {
    it('aggregates reliability, latency, feedback, and token estimates', () => {
        const report = buildBugbotAnalytics([snapshot(100, 'completed'), snapshot(300, 'failed')]);
        expect(report).toMatchObject({
            reviews: 2,
            nonFailureRate: 0.5,
            reviewCompletionRate: 0.5,
            latencyMs: { p50: 100, p95: 300, maximum: 300 },
            resolutionEvents: 2,
            findingStateObservations: { open: 0, fixed: 2, obsolete: 0, dismissed: 0, reopened: 0 },
            estimatedInputTokens: 20,
        });
        expect(report.stageP95Ms.analysis).toBe(150);
    });

    it('excludes skipped and superseded runs from the review completion denominator', () => {
        const report = buildBugbotAnalytics([
            snapshot(100, 'completed'),
            snapshot(100, 'skipped'),
            snapshot(100, 'superseded'),
        ]);

        expect(report.nonFailureRate).toBe(1);
        expect(report.reviewCompletionRate).toBe(1);
    });

    it('parses JSON arrays and prefixed JSONL while ignoring unrelated log lines', () => {
        const first = snapshot(100, 'completed');
        expect(parseBugbotTelemetry(JSON.stringify([first]))).toHaveLength(1);
        expect(parseBugbotTelemetry(`noise\n[bugbot.telemetry] ${JSON.stringify(first)}`)).toHaveLength(1);
    });

    it('normalizes incomplete external telemetry and rejects invalid durations', () => {
        const parsed = parseBugbotTelemetry(JSON.stringify([
            { schemaVersion: 1, reviewId: 'minimal', elapsedMs: 12, outcome: 'completed' },
            { schemaVersion: 1, reviewId: 'bad', elapsedMs: -1, outcome: 'completed' },
        ]));

        expect(parsed).toHaveLength(1);
        expect(parsed[0]).toEqual(expect.objectContaining({
            repository: 'unknown/unknown',
            stagesMs: {},
            candidateFindings: 0,
        }));
        expect(() => buildBugbotAnalytics(parsed)).not.toThrow();
    });
});
