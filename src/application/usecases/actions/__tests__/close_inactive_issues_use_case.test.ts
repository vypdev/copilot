import { CloseInactiveIssuesUseCase } from '../close_inactive_issues_use_case';
import type { Execution } from '../../../../data/model/execution';
import type { IssueActivitySnapshot } from '../../../../domain/issue_inactivity';

jest.mock('../../../../utils/logger', () => ({
    logInfo: jest.fn(),
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

function execution(overrides: Record<string, unknown> = {}): Execution {
    return {
        owner: 'owner',
        repo: 'repo',
        tokens: { token: 'token' },
        inactivityThresholdHours: 168,
        labels: {
            lifecycle: {
                awaitingMaintainer: 'state:awaiting-maintainer',
                awaitingIssueAuthor: 'state:awaiting-issue-author',
                aiProcessing: 'state:ai-processing',
            },
        },
        ...overrides,
    } as unknown as Execution;
}

function snapshot(overrides: Partial<IssueActivitySnapshot> = {}): IssueActivitySnapshot {
    return {
        number: 42,
        updatedAt: '2026-08-28T00:00:00.000Z',
        isPullRequest: false,
        labels: ['state:awaiting-maintainer'],
        ...overrides,
    };
}

describe('CloseInactiveIssuesUseCase', () => {
    const listOpenIssuesByLabel = jest.fn();
    const getOpenIssue = jest.fn();
    const closeIssue = jest.fn();
    const addComment = jest.fn();
    const nowMilliseconds = Date.parse('2026-09-04T00:00:00.000Z');

    function createUseCase() {
        return new CloseInactiveIssuesUseCase(
            { listOpenIssuesByLabel, getOpenIssue },
            { closeIssue, addComment },
            { nowMilliseconds: () => nowMilliseconds },
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        listOpenIssuesByLabel.mockResolvedValue([]);
        getOpenIssue.mockImplementation(async (_owner: string, _repo: string, issueNumber: number) => snapshot({ number: issueNumber }));
        closeIssue.mockResolvedValue(true);
        addComment.mockResolvedValue(undefined);
    });

    it('scans both waiting queues, revalidates, closes, and comments stale issues', async () => {
        listOpenIssuesByLabel
            .mockResolvedValueOnce([snapshot()])
            .mockResolvedValueOnce([snapshot({ number: 42, labels: ['state:awaiting-issue-author'] })]);

        const [result] = await createUseCase().invoke(execution());

        expect(listOpenIssuesByLabel).toHaveBeenCalledTimes(2);
        expect(getOpenIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
        expect(closeIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
        expect(addComment).toHaveBeenCalledWith(
            'owner',
            'repo',
            42,
            expect.stringContaining('automatically closed due to inactivity'),
            'token',
        );
        expect(result).toMatchObject({
            id: 'CloseInactiveIssuesUseCase',
            success: true,
            executed: true,
            payload: { scanned: 1, eligible: 1, closed: 1, skipped: 0 },
        });
    });

    it('does not close pull requests or recently active issues', async () => {
        listOpenIssuesByLabel
            .mockResolvedValueOnce([snapshot({ isPullRequest: true })])
            .mockResolvedValueOnce([snapshot({ number: 43, updatedAt: '2026-09-03T00:00:01.000Z' })]);

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).not.toHaveBeenCalled();
        expect(addComment).not.toHaveBeenCalled();
        expect(result.payload).toEqual({ scanned: 2, eligible: 0, closed: 0, skipped: 2 });
    });

    it('skips a candidate that becomes active before the mutation', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        getOpenIssue.mockResolvedValue(snapshot({ updatedAt: '2026-09-03T00:00:01.000Z' }));

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).not.toHaveBeenCalled();
        expect(result.payload).toEqual({ scanned: 1, eligible: 1, closed: 0, skipped: 1 });
    });

    it('continues scanning when one candidate mutation fails and reports failure', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot(), snapshot({ number: 43 })]);
        closeIssue.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValueOnce(true);

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(false);
        expect(result.errors[0].message).toContain('Unable to close issue #42');
        expect(addComment).toHaveBeenCalledTimes(1);
    });

    it('does not comment when the idempotent close operation reports that the issue is already closed', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        closeIssue.mockResolvedValue(false);

        const [result] = await createUseCase().invoke(execution());

        expect(addComment).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            success: true,
            payload: { scanned: 1, eligible: 1, closed: 0, skipped: 1 },
        });
    });

    it('returns a failure when the candidate scan cannot be completed', async () => {
        listOpenIssuesByLabel.mockRejectedValue(new Error('rate limited'));

        const [result] = await createUseCase().invoke(execution());

        expect(result.success).toBe(false);
        expect(result.steps[0]).toContain('Unable to scan issues');
        expect(closeIssue).not.toHaveBeenCalled();
    });
});
