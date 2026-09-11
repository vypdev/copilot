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

    it('reports active findings as a warning unless fail-on-unresolved is enabled', () => {
        const summary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'pull_request',
            issueNumber: -1,
            pullRequestNumber: 12,
            pullRequestDescriptionMode: 'append',
            results: [new Result({
                id: 'Review',
                success: true,
                executed: true,
                payload: { findingStates: { open: 1, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0 } },
            })],
        });

        expect(summary).toContain('⚠️ Findings');
        expect(summary).toContain('open=1');
        expect(summary).toContain('append');

        const blockingSummary = buildActionSummary({
            owner: 'owner',
            repository: 'repo',
            eventName: 'pull_request',
            issueNumber: -1,
            pullRequestNumber: 12,
            failOnUnresolvedFindings: true,
            results: [new Result({
                id: 'Review', success: true, executed: true,
                payload: { findingStates: { open: 1, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0 } },
            })],
        });
        expect(blockingSummary).toContain('❌ Failure');
    });

    it('aggregates lifecycle counts from every Bugbot result', () => {
        const summary = buildActionSummary({
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
            results: [
                new Result({ id: 'one', success: true, executed: true, payload: { findingStates: { open: 1, reopened: 0, fixed: 1, obsolete: 0, dismissed: 0 } } }),
                new Result({ id: 'two', success: true, executed: true, payload: { findingStates: { open: 0, reopened: 2, fixed: 0, obsolete: 1, dismissed: 0 } } }),
            ],
        });

        expect(summary).toContain('open=1, reopened=2, fixed=1, obsolete=1');
    });

    it('shows verification-required as actionable and unknown as a failure', () => {
        const base = {
            owner: 'owner', repository: 'repo', eventName: 'pull_request', issueNumber: -1, pullRequestNumber: 12,
        };
        expect(buildActionSummary({
            ...base,
            results: [new Result({ id: 'review', success: true, executed: true, payload: {
                findingStates: { open: 0, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0, 'verification-required': 1, unknown: 0 },
            } })],
        })).toContain('⚠️ Findings');
        expect(buildActionSummary({
            ...base,
            results: [new Result({ id: 'review', success: true, executed: true, payload: {
                findingStates: { open: 0, reopened: 0, fixed: 0, obsolete: 0, dismissed: 0, 'verification-required': 0, unknown: 1 },
            } })],
        })).toContain('❌ Failure');
    });
});
