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

    it('fails the review check when the analysis leaves active findings', () => {
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
            conclusion: 'failure',
            title: 'Copilot found actionable findings',
        });
    });
});
