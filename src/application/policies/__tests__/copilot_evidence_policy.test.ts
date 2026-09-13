import { buildCopilotEvidence } from '../copilot_evidence_policy';
import { Result } from '../../../data/model/result';

const telemetry = (outcome: string, headSha = 'sha-123') => ({
    bugbotTelemetry: { schemaVersion: 1, outcome, elapsedMs: 10, configuredEffort: 'smart', headSha },
});
const findingStates = (overrides: Record<string, number> = {}) => ({
    open: 0,
    reopened: 0,
    fixed: 0,
    obsolete: 0,
    dismissed: 0,
    'verification-required': 0,
    unknown: 0,
    ...overrides,
});

describe('buildCopilotEvidence', () => {
    it('selects stable review name and failure conclusion for PRs', () => {
        const evidence = buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({ id: 'review', success: false, executed: true, payload: telemetry('failed') })],
        });
        expect(evidence).toEqual({
            name: 'Copilot / Review',
            headSha: 'sha-123',
            conclusion: 'failure',
            title: 'Copilot found actionable failures',
            summary: 'summary',
        });
    });

    it('does not create a check when the event has no commit identity', () => {
        expect(buildCopilotEvidence({ eventName: 'issues', summary: 'summary', results: [] })).toBeUndefined();
    });

    it('publishes an explicitly neutral non-review check when no result was produced', () => {
        expect(buildCopilotEvidence({
            eventName: 'issues',
            headSha: 'sha-123',
            summary: 'summary',
            results: [],
        })).toMatchObject({
            name: 'Copilot / Plan',
            conclusion: 'neutral',
            title: 'Copilot review produced no actionable result',
        });
    });

    it('uses neutral findings by default and fails only when configured', () => {
        const evidence = buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({
                id: 'review',
                success: true,
                executed: true,
                payload: {
                    ...telemetry('completed'),
                    findingStates: findingStates({ open: 1 }),
                },
            })],
        });

        expect(evidence).toMatchObject({
            conclusion: 'neutral',
            title: 'Copilot found actionable findings',
        });

        expect(buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            failOnUnresolvedFindings: true,
            results: [new Result({
                id: 'review', success: true, executed: true,
                payload: { ...telemetry('completed'), findingStates: findingStates({ open: 1 }) },
            })],
        })).toMatchObject({ conclusion: 'failure', title: 'Copilot found actionable findings' });
    });

    it('aggregates finding states across results and classifies every pull-request event as a review', () => {
        const evidence = buildCopilotEvidence({
            eventName: 'pull_request_review',
            headSha: 'sha-123',
            summary: 'summary',
            results: [
                new Result({ id: 'first', success: true, executed: true, payload: { ...telemetry('completed'), findingStates: findingStates() } }),
                new Result({ id: 'second', success: true, executed: true, payload: { findingStates: findingStates({ reopened: 1 }) } }),
            ],
        });

        expect(evidence).toMatchObject({ name: 'Copilot / Review', conclusion: 'neutral' });
    });

    it('treats verification-required as actionable and unknown as an unconditional failure', () => {
        const verificationRequired = findingStates({ 'verification-required': 1 });
        expect(buildCopilotEvidence({
            eventName: 'pull_request', headSha: 'sha', summary: 'summary',
            results: [new Result({ id: 'review', success: true, executed: true, payload: { ...telemetry('completed', 'sha'), findingStates: verificationRequired } })],
        })).toMatchObject({ conclusion: 'neutral', title: 'Copilot found actionable findings' });
        expect(buildCopilotEvidence({
            eventName: 'pull_request', headSha: 'sha', summary: 'summary',
            results: [new Result({ id: 'review', success: true, executed: true, payload: {
                ...telemetry('completed', 'sha'),
                findingStates: findingStates({ unknown: 1 }),
            } })],
        })).toMatchObject({ conclusion: 'failure' });
    });

    it.each([
        ['metadata-only', { metadata: true }],
        ['mismatched head', telemetry('no-findings', 'older-sha')],
        ['dry run', telemetry('dry-run')],
    ])('does not publish Review evidence for a %s PR result', (_label, payload) => {
        expect(buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({ id: 'result', success: true, executed: true, payload })],
        })).toBeUndefined();
    });

    it.each([
        ['partial', 'Copilot review has partial coverage', findingStates()],
        ['superseded', 'Copilot review was superseded', undefined],
        ['skipped', 'Copilot review was skipped', undefined],
    ])('publishes %s review evidence as neutral', (outcome, title, states) => {
        expect(buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({
                id: 'review',
                success: true,
                executed: true,
                payload: { ...telemetry(outcome), ...(states ? { findingStates: states } : {}) },
            })],
        })).toMatchObject({ name: 'Copilot / Review', conclusion: 'neutral', title });
    });

    it.each([
        ['no-findings', 'success', 'Copilot completed successfully'],
        ['failed', 'failure', 'Copilot found actionable failures'],
    ])('maps a %s review to its terminal Check conclusion', (outcome, conclusion, title) => {
        expect(buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({
                id: 'review',
                success: true,
                executed: true,
                payload: {
                    ...telemetry(outcome),
                    ...(outcome === 'no-findings' ? { findingStates: findingStates() } : {}),
                },
            })],
        })).toMatchObject({ conclusion, title });
    });

    it.each(['completed', 'no-findings', 'partial'])(
        'fails closed when exact-head %s telemetry omits finding-state evidence',
        (outcome) => {
            expect(buildCopilotEvidence({
                eventName: 'pull_request',
                headSha: 'sha-123',
                summary: 'summary',
                results: [new Result({ id: 'review', success: true, executed: true, payload: telemetry(outcome) })],
            })).toMatchObject({ conclusion: 'failure', title: 'Copilot found actionable failures' });
        },
    );

    it('keeps non-review evidence independent from Bugbot telemetry', () => {
        expect(buildCopilotEvidence({
            eventName: 'issues',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({ id: 'metadata', success: true, executed: true })],
        })).toMatchObject({ name: 'Copilot / Plan', conclusion: 'success' });
        expect(buildCopilotEvidence({
            eventName: 'push',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({ id: 'verification', success: true, executed: true })],
        })).toMatchObject({ name: 'Copilot / Verification', conclusion: 'success' });
    });

    it.each([
        { open: '1', reopened: 0 },
        { open: 0, reopened: '1' },
    ])('fails closed for malformed finding-state aggregates', (malformedFindingStates) => {
        expect(buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({
                id: 'review',
                success: true,
                executed: true,
                payload: { ...telemetry('no-findings'), findingStates: malformedFindingStates },
            })],
        })).toMatchObject({ conclusion: 'failure', title: 'Copilot found actionable failures' });
    });
});
