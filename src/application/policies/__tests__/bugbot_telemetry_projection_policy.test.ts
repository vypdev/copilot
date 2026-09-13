import { Result } from '../../../data/model/result';
import {
    projectBugbotTelemetry,
    selectBugbotTelemetry,
} from '../bugbot_telemetry_projection_policy';

describe('Bugbot telemetry projection policy', () => {
    it('projects bounded semantic review facts and normalizes presentation fields', () => {
        expect(projectBugbotTelemetry({
            bugbotTelemetry: {
                schemaVersion: 1,
                outcome: 'partial',
                elapsedMs: -4,
                configuredEffort: ' smart ',
                headSha: ' abc123 ',
                responseCharacters: 999,
            },
        })).toEqual({
            schemaVersion: 1,
            outcome: 'partial',
            elapsedMs: 0,
            configuredEffort: 'smart',
            headSha: 'abc123',
        });
    });

    it.each([
        undefined,
        {},
        { bugbotTelemetry: { schemaVersion: 1, outcome: 'unknown', elapsedMs: 10 } },
        { bugbotTelemetry: { schemaVersion: 1, outcome: 'completed', elapsedMs: Number.NaN } },
    ])('rejects malformed telemetry without inferring review evidence', (payload) => {
        expect(projectBugbotTelemetry(payload)).toBeUndefined();
    });

    it('rejects telemetry without the current schema identity', () => {
        expect(projectBugbotTelemetry({
            bugbotTelemetry: { outcome: 'completed', elapsedMs: 10, headSha: 'abc123' },
        })).toBeUndefined();
    });

    it('uses presentation defaults and rejects absent or ambiguous result sets', () => {
        const results = [
            new Result({ id: 'metadata', success: true, executed: true }),
            new Result({
                id: 'review',
                success: true,
                executed: true,
                payload: { bugbotTelemetry: { schemaVersion: 1, outcome: 'no-findings', elapsedMs: 12, configuredEffort: ' ' } },
            }),
            new Result({
                id: 'later',
                success: true,
                executed: true,
                payload: { bugbotTelemetry: { schemaVersion: 1, outcome: 'failed', elapsedMs: 20, configuredEffort: 'high' } },
            }),
        ];

        expect(selectBugbotTelemetry(results.slice(0, 2))).toEqual({
            schemaVersion: 1,
            outcome: 'no-findings',
            elapsedMs: 12,
            configuredEffort: 'default',
        });
        expect(selectBugbotTelemetry([])).toBeUndefined();
        expect(selectBugbotTelemetry(results)).toBeUndefined();
    });
});
