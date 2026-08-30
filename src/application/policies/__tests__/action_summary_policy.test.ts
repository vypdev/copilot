import { Result } from '../../../data/model/result';
import { buildActionSummary } from '../action_summary_policy';

describe('action summary policy', () => {
    it('renders bounded result details and lifecycle metadata', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'issues',
            issueNumber: 7,
            pullRequestNumber: -1,
            lifecycleState: 'planned',
            results: [new Result({ id: 'Plan', success: true, executed: true, steps: ['## Ready', 'safe | text'] })],
        });

        expect(summary).toContain('# Copilot execution');
        expect(summary).toContain('`planned`');
        expect(summary).toContain('safe | text');
        expect(summary).not.toContain('{{');
    });

    it('reports executed failures without exposing raw stack traces', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'push',
            issueNumber: -1,
            pullRequestNumber: -1,
            results: [new Result({ id: 'Failure', success: false, executed: true, errors: [new Error('token=secret-value\n    at hidden()')] })],
        });

        expect(summary).toContain('❌ Failure');
        expect(summary).not.toContain('secret-value');
        expect(summary).not.toContain('at hidden');
    });

    it('reports active findings as actionable failure evidence', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'pull_request',
            issueNumber: -1,
            pullRequestNumber: 12,
            results: [new Result({
                id: 'Review',
                success: true,
                executed: true,
                payload: { findingStates: { open: 1, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0 } },
            })],
        });

        expect(summary).toContain('❌ Failure');
        expect(summary).toContain('open=1');
    });
});
