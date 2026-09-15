import { CloseInactiveIssuesUseCase } from '../close_inactive_issues_use_case';
import type { Execution } from '../../../../data/model/execution';
import type { IssueActivitySnapshot } from '../../../../domain/issue_inactivity';
import { projectInactivityContext } from '../../push_single_action_contexts';
import { ResolveMessageCatalogUseCase } from '../../localization/resolve_message_catalog_use_case';

jest.mock('../../../../utils/logger', () => ({
    logInfo: jest.fn(),
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

function execution(overrides: Record<string, unknown> = {}) {
    return projectInactivityContext({
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
        ai: {
            getAgentConfiguration: () => ({ provider: 'codex', model: 'planner-model' }),
        },
        ...overrides,
    } as unknown as Execution);
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

    function createUseCase(catalogResolver?: ResolveMessageCatalogUseCase) {
        return new CloseInactiveIssuesUseCase(
            { listOpenIssuesByLabel, getOpenIssue },
            { closeIssue, addComment },
            { nowMilliseconds: () => nowMilliseconds },
            catalogResolver,
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        listOpenIssuesByLabel.mockResolvedValue([]);
        getOpenIssue.mockImplementation(async (issueNumber: number) => snapshot({ number: issueNumber }));
        closeIssue.mockResolvedValue(true);
        addComment.mockResolvedValue(undefined);
    });

    it('scans both waiting queues, revalidates, closes, and comments stale issues', async () => {
        listOpenIssuesByLabel
            .mockResolvedValueOnce([snapshot()])
            .mockResolvedValueOnce([snapshot({ number: 42, labels: ['state:awaiting-issue-author'] })]);

        const [result] = await createUseCase().invoke(execution());

        expect(listOpenIssuesByLabel).toHaveBeenCalledTimes(2);
        expect(getOpenIssue).toHaveBeenCalledWith(42);
        expect(closeIssue).toHaveBeenCalledWith(42);
        expect(addComment).toHaveBeenCalledWith(
            42,
            expect.stringContaining('## Issue closed after inactivity'),
        );
        expect(addComment.mock.calls[0][1]).toContain('topic="inactivity" target="issue:42"');
        expect(result).toMatchObject({
            id: 'CloseInactiveIssuesUseCase',
            success: true,
            executed: true,
            payload: {
                scanned: 1, eligible: 1, closed: 1, commented: 1,
                commentFailures: 0, failures: 0, skipped: 0,
            },
        });
    });

    it('uses the configured issue locale for the terminal explanation', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);

        const [result] = await createUseCase().invoke(execution({
            locale: { repository: 'es-MX', issue: 'es-MX' },
        }));

        expect(addComment.mock.calls[0][1]).toContain('## Issue cerrada por inactividad');
        expect(addComment.mock.calls[0][1]).toContain('168 horas');
        expect(result.steps).toEqual([
            'Se revisó 1 issue abierta que esperaba una respuesta.',
            'Se cerró 1 issue tras superar el límite de inactividad.',
        ]);
    });

    it('uses issue locale for the comment and repository locale for result evidence', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);

        const [result] = await createUseCase().invoke(execution({
            locale: { repository: 'en-US', issue: 'es-ES' },
        }));

        expect(addComment.mock.calls[0][1]).toContain('## Issue cerrada por inactividad');
        expect(result.steps).toEqual([
            'Scanned 1 open issue waiting for a response.',
            'Closed 1 issue after the inactivity threshold.',
        ]);
    });

    it('resolves a non-bundled locale once and reuses it for every candidate', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot(), snapshot({ number: 43 })]);
        const messages = {
            'inactivity.closure.heading': 'Issue wegen Inaktivität geschlossen',
            'inactivity.closure.reason': {
                one: 'Seit {count} Stunde gab es keine Aktivität.',
                other: 'Seit {count} Stunden gab es keine Aktivität.',
            },
            'inactivity.closure.reopen': 'Bei Bedarf erneut öffnen und den aktuellen Kontext ergänzen.',
            'inactivity.summary.scanned': { one: '{count} Issue geprüft.', other: '{count} Issues geprüft.' },
            'inactivity.summary.closed': { one: '{count} Issue geschlossen.', other: '{count} Issues geschlossen.' },
            'inactivity.summary.skipped': { one: '{count} Kandidat übersprungen.', other: '{count} Kandidaten übersprungen.' },
            'inactivity.summary.none': 'Kein Issue wurde geschlossen.',
            'inactivity.error.scan': 'Issues konnten nicht geprüft werden.',
            'inactivity.error.revalidate': 'Issue #{issueNumber} konnte nicht erneut geprüft werden.',
            'inactivity.error.close': 'Issue #{issueNumber} konnte nicht geschlossen werden.',
            'inactivity.error.comment': 'Issue #{issueNumber} wurde geschlossen, aber die Erklärung fehlt.',
            'inactivity.error.commentImpact': 'Issue #{issueNumber} wurde ohne Erklärung geschlossen.',
            'inactivity.error.commentAction': 'Issue #{issueNumber} manuell prüfen.',
            'inactivity.error.commentRetainedState': 'Issue #{issueNumber} bleibt geschlossen.',
        };
        const query = jest.fn().mockResolvedValue({ targetLocale: 'de-DE', messages });

        const [result] = await createUseCase(
            new ResolveMessageCatalogUseCase({ query }),
        ).invoke(execution({ locale: { repository: 'de-DE', issue: 'de-DE' } }));

        expect(query).toHaveBeenCalledTimes(1);
        expect(addComment).toHaveBeenCalledTimes(2);
        expect(addComment.mock.calls[0][1]).toContain('## Issue wegen Inaktivität geschlossen');
        expect(result.steps).toContain('2 Issues geschlossen.');
    });

    it('falls back atomically to English when a dynamic catalog is unsafe', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        const query = jest.fn().mockResolvedValue({
            targetLocale: 'de-DE',
            messages: { 'inactivity.closure.heading': '@team' },
        });

        const [result] = await createUseCase(
            new ResolveMessageCatalogUseCase({ query }),
        ).invoke(execution({ locale: { repository: 'de-DE', issue: 'de-DE' } }));

        expect(addComment.mock.calls[0][1]).toContain('## Issue closed after inactivity');
        expect(result.steps[0]).toBe('Scanned 1 open issue waiting for a response.');
    });

    it('does not close pull requests or recently active issues', async () => {
        listOpenIssuesByLabel
            .mockResolvedValueOnce([snapshot({ isPullRequest: true })])
            .mockResolvedValueOnce([snapshot({ number: 43, updatedAt: '2026-09-03T00:00:01.000Z' })]);

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).not.toHaveBeenCalled();
        expect(addComment).not.toHaveBeenCalled();
        expect(result.payload).toEqual({
            scanned: 2, eligible: 0, closed: 0, commented: 0,
            commentFailures: 0, failures: 0, skipped: 2,
        });
    });

    it('skips a candidate that becomes active before the mutation', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        getOpenIssue.mockResolvedValue(snapshot({ updatedAt: '2026-09-03T00:00:01.000Z' }));

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).not.toHaveBeenCalled();
        expect(result.payload).toEqual({
            scanned: 1, eligible: 1, closed: 0, commented: 0,
            commentFailures: 0, failures: 0, skipped: 1,
        });
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

    it('reports a revalidation failure without claiming that closure failed', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        getOpenIssue.mockRejectedValueOnce(new Error('provider unavailable'));

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).not.toHaveBeenCalled();
        expect(result.errors[0].message).toBe('Unable to recheck issue #42 before inactivity closure.');
        expect(result.payload).toMatchObject({ closed: 0, failures: 1 });
    });

    it('keeps a successful close visible when only its explanation publication fails', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        addComment.mockRejectedValueOnce(new Error('comments unavailable'));

        const [result] = await createUseCase().invoke(execution());

        expect(closeIssue).toHaveBeenCalledWith(42);
        expect(result.success).toBe(false);
        expect(result.errors[0].message).toBe(
            'Issue #42 was closed, but its inactivity explanation could not be published.',
        );
        expect(result.errors[0]).toMatchObject({
            retryable: false,
            impact: 'Issue #42 was closed without its terminal inactivity explanation.',
            action: 'Inspect issue #42 and add the explanation manually if the missing context matters.',
            retainedState: 'Issue #42 remains closed; the completed close will not be repeated.',
        });
        expect(result.payload).toMatchObject({
            closed: 1, commented: 0, commentFailures: 1, failures: 1,
        });
        expect(result.steps).toContain('Closed 1 issue after the inactivity threshold.');
    });

    it('does not comment when the idempotent close operation reports that the issue is already closed', async () => {
        listOpenIssuesByLabel.mockResolvedValueOnce([snapshot()]);
        closeIssue.mockResolvedValue(false);

        const [result] = await createUseCase().invoke(execution());

        expect(addComment).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            success: true,
            payload: {
                scanned: 1, eligible: 1, closed: 0, commented: 0,
                commentFailures: 0, failures: 0, skipped: 1,
            },
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
