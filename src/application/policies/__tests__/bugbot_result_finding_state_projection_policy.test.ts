import { Result } from '../../../data/model/result';
import { projectBugbotResultFindingStates } from '../bugbot_result_finding_state_projection_policy';

const counts = (overrides: Record<string, unknown> = {}) => ({
    open: 0,
    reopened: 0,
    fixed: 0,
    obsolete: 0,
    dismissed: 0,
    'verification-required': 0,
    unknown: 0,
    ...overrides,
});
const telemetry = (outcome: string) => ({
    bugbotTelemetry: { schemaVersion: 1, outcome, elapsedMs: 10, configuredEffort: 'smart', headSha: 'sha-123' },
});

describe('Bugbot result finding-state projection policy', () => {
    it('distinguishes result sets without owned finding-state evidence', () => {
        expect(projectBugbotResultFindingStates([
            new Result({ id: 'metadata', success: true, executed: true, payload: { other: true } }),
        ])).toEqual({ status: 'absent' });
    });

    it.each(['completed', 'no-findings', 'partial', 'dry-run'])(
        'fails closed when %s telemetry has no canonical finding-state evidence',
        (outcome) => {
            expect(projectBugbotResultFindingStates([
                new Result({ id: 'review', success: true, executed: true, payload: telemetry(outcome) }),
            ])).toEqual({ status: 'invalid' });
        },
    );

    it.each(['skipped', 'superseded', 'failed'])(
        'allows absent finding-state evidence for a %s outcome that cannot claim a clean review',
        (outcome) => {
            expect(projectBugbotResultFindingStates([
                new Result({ id: 'review', success: outcome !== 'failed', executed: true, payload: telemetry(outcome) }),
            ])).toEqual({ status: 'absent' });
        },
    );

    it('validates and aggregates complete canonical counts', () => {
        const projection = projectBugbotResultFindingStates([
            new Result({ id: 'one', success: true, executed: true, payload: { findingStates: counts({ open: 1 }) } }),
            new Result({ id: 'two', success: true, executed: true, payload: { findingStates: counts({ reopened: 2, fixed: 1 }) } }),
        ]);
        expect(projection).toEqual({
            status: 'valid',
            counts: counts({ open: 1, reopened: 2, fixed: 1 }),
        });
        expect(projection.status === 'valid' && Object.isFrozen(projection.counts)).toBe(true);
    });

    it.each([
        undefined,
        {},
        counts({ open: -1 }),
        counts({ reopened: 0.5 }),
        counts({ unknown: Number.NaN }),
        counts({ unexpected: 1 }),
        Object.create(counts()),
    ])('fails closed for malformed owned counts %#', (findingStates) => {
        expect(projectBugbotResultFindingStates([
            new Result({ id: 'review', success: true, executed: true, payload: { findingStates } }),
        ])).toEqual({ status: 'invalid' });
    });

    it('rejects aggregate count overflow', () => {
        expect(projectBugbotResultFindingStates([
            new Result({ id: 'one', success: true, executed: true, payload: { findingStates: counts({ open: Number.MAX_SAFE_INTEGER }) } }),
            new Result({ id: 'two', success: true, executed: true, payload: { findingStates: counts({ open: 1 }) } }),
        ])).toEqual({ status: 'invalid' });
    });

    it('rejects valid state counts when any owned telemetry sibling is malformed or duplicated', () => {
        const valid = new Result({
            id: 'valid',
            success: true,
            executed: true,
            payload: { ...telemetry('completed'), findingStates: counts() },
        });
        const malformed = new Result({
            id: 'malformed',
            success: true,
            executed: true,
            payload: { bugbotTelemetry: { schemaVersion: 2, outcome: 'completed', elapsedMs: 10 } },
        });

        expect(projectBugbotResultFindingStates([valid, malformed])).toEqual({ status: 'invalid' });
        expect(projectBugbotResultFindingStates([valid, valid])).toEqual({ status: 'invalid' });
    });
});
