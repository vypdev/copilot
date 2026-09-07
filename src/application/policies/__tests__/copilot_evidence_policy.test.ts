import { buildCopilotEvidence } from '../copilot_evidence_policy';
import { Result } from '../../../data/model/result';

describe('buildCopilotEvidence', () => {
    it('selects stable review name and failure conclusion for PRs', () => {
        const evidence = buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({ id: 'review', success: false, executed: true })],
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

    it('uses neutral findings by default and fails only when configured', () => {
        const evidence = buildCopilotEvidence({
            eventName: 'pull_request',
            headSha: 'sha-123',
            summary: 'summary',
            results: [new Result({
                id: 'review',
                success: true,
                executed: true,
                payload: { findingStates: { open: 1, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0 } },
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
                payload: { findingStates: { open: 1, reopened: 0 } },
            })],
        })).toMatchObject({ conclusion: 'failure', title: 'Copilot found actionable findings' });
    });

    it('aggregates finding states across results and classifies every pull-request event as a review', () => {
        const evidence = buildCopilotEvidence({
            eventName: 'pull_request_review',
            headSha: 'sha-123',
            summary: 'summary',
            results: [
                new Result({ id: 'first', success: true, executed: true, payload: { findingStates: { open: 0, reopened: 0 } } }),
                new Result({ id: 'second', success: true, executed: true, payload: { findingStates: { open: 0, reopened: 1 } } }),
            ],
        });

        expect(evidence).toMatchObject({ name: 'Copilot / Review', conclusion: 'neutral' });
    });
});
