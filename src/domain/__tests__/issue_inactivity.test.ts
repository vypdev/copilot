import { evaluateIssueInactivity } from '../issue_inactivity';

const waitingLabels = ['state:awaiting-maintainer', 'state:awaiting-issue-author'];

function issue(overrides: Partial<Parameters<typeof evaluateIssueInactivity>[0]['issue']> = {}) {
    return {
        number: 42,
        updatedAt: '2026-08-28T00:00:00.000Z',
        isPullRequest: false,
        labels: [' State:Awaiting-Maintainer '],
        ...overrides,
    };
}

describe('issue inactivity policy', () => {
    const nowMilliseconds = Date.parse('2026-09-04T00:00:00.000Z');

    it('closes exactly at the configured threshold', () => {
        expect(evaluateIssueInactivity({
            issue: issue(),
            waitingLabels,
            agentActivityLabel: 'state:ai-processing',
            thresholdHours: 168,
            nowMilliseconds,
        })).toEqual({
            kind: 'close',
            inactiveForMilliseconds: 168 * 60 * 60 * 1000,
        });
    });

    it.each([
        ['pull requests', issue({ isPullRequest: true }), 'pull-request'] as const,
        ['issues without a waiting label', issue({ labels: ['bug'] }), 'not-waiting'] as const,
        ['issues currently processed by an agent', issue({ labels: ['state:awaiting-maintainer', 'state:ai-processing'] }), 'agent-processing'] as const,
        ['issues without a valid timestamp', issue({ updatedAt: undefined }), 'missing-activity-timestamp'] as const,
        ['recently active issues', issue({ updatedAt: '2026-09-03T00:00:01.000Z' }), 'recent-activity'] as const,
    ])('skips %s', (_description, candidate, reason) => {
        expect(evaluateIssueInactivity({
            issue: candidate,
            waitingLabels,
            agentActivityLabel: 'state:ai-processing',
            thresholdHours: 168,
            nowMilliseconds,
        })).toEqual({ kind: 'skip', reason });
    });

    it('skips future timestamps and invalid thresholds', () => {
        expect(evaluateIssueInactivity({
            issue: issue({ updatedAt: '2026-09-05T00:00:00.000Z' }),
            waitingLabels,
            agentActivityLabel: 'state:ai-processing',
            thresholdHours: 168,
            nowMilliseconds,
        })).toEqual({ kind: 'skip', reason: 'future-activity' });
        expect(evaluateIssueInactivity({
            issue: issue(),
            waitingLabels,
            agentActivityLabel: 'state:ai-processing',
            thresholdHours: 0,
            nowMilliseconds,
        })).toEqual({ kind: 'skip', reason: 'invalid-threshold' });
    });
});
