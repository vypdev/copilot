import { DismissBugbotFindingsUseCase } from '../dismiss_bugbot_findings_use_case';
import type { BugbotContextSelectionContext } from '../bugbot_review_operation_context';

const mockLoadBugbotContext = jest.fn();
const mockMarkFindingsResolved = jest.fn();

jest.mock('../load_bugbot_context_use_case', () => ({
    loadBugbotContext: (...args: unknown[]) => mockLoadBugbotContext(...args),
}));
jest.mock('../mark_findings_resolved_workflow', () => ({
    markFindingsResolved: (...args: unknown[]) => mockMarkFindingsResolved(...args),
}));

function operation(): BugbotContextSelectionContext {
    return {
        repository: { owner: 'owner', name: 'repo' },
        target: {
            issueNumber: 7,
            isPullRequest: false,
            pullRequestNumber: -1,
            headBranch: 'feature/7',
            commitBranch: 'feature/7',
            baseBranch: 'develop',
            pullRequestAction: '',
            draft: false,
        },
        trigger: { kind: 'issue_comment', headOwner: 'owner' },
        ignorePatterns: [],
        organizationRules: [],
    };
}

describe('DismissBugbotFindingsUseCase', () => {
    beforeEach(() => {
        mockLoadBugbotContext.mockReset();
        mockMarkFindingsResolved.mockReset();
        mockMarkFindingsResolved.mockResolvedValue([]);
        mockLoadBugbotContext.mockResolvedValue({
            existingByFindingId: { 'finding-1': { issue: { commentId: 10, resolved: false } } },
            issueComments: [{ id: 10, body: 'finding' }],
            canonicalPullRequest: null,
            selectionReason: 'none',
            coverage: { status: 'complete', sources: [] },
            eligibleResolutionIds: new Set(['finding-1']),
            previousFindingsBlock: '',
            prContext: null,
            unresolvedFindingsWithBody: [],
        });
    });

    it('dismisses only IDs that exist in persisted findings', async () => {
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });

        const results = await useCase.invoke({ operation: operation(), findingIds: ['finding-1', 'missing'] });

        expect(mockMarkFindingsResolved).toHaveBeenCalledWith(expect.objectContaining({
            resolvedFindingIds: new Set(['finding-1']),
        }));
        expect(results[0]).toMatchObject({ success: true, executed: true });
    });

    it('uses the issue locale for the durable dismissal note', async () => {
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });

        await useCase.invoke({
            operation: {
                ...operation(),
                locale: { issue: 'es-MX', pullRequest: 'fr-FR' },
                agentConfiguration: { provider: 'codex', model: 'model' },
            },
            findingIds: ['finding-1'],
        });

        const catalog = mockMarkFindingsResolved.mock.calls[0][0].catalog;
        expect(catalog).toMatchObject({ resolutionSource: 'base', locale: 'es-ES' });
        expect(catalog.message('bugbot.finding.dismissedLabel')).toBe('Descartado');
    });

    it('uses the PR locale and reports every failed dismissal mutation', async () => {
        mockLoadBugbotContext.mockResolvedValueOnce({
            existingByFindingId: {
                'finding-1': { issue: { commentId: 10, resolved: false } },
                'finding-2': { issue: { commentId: 11, resolved: false } },
            },
            issueComments: [],
            canonicalPullRequest: null,
            selectionReason: 'none',
            coverage: { status: 'complete', sources: [] },
            eligibleResolutionIds: new Set(['finding-1', 'finding-2']),
            previousFindingsBlock: '',
            prContext: null,
            unresolvedFindingsWithBody: [],
        });
        mockMarkFindingsResolved.mockResolvedValueOnce([new Error('provider detail')]);
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });
        const request = operation();

        const results = await useCase.invoke({
            operation: {
                ...request,
                target: { ...request.target, isPullRequest: true, pullRequestNumber: 17 },
                locale: { issue: 'fr-FR', pullRequest: 'es-MX' },
            },
            findingIds: ['finding-1', 'finding-2'],
        });

        expect(mockMarkFindingsResolved.mock.calls[0][0].catalog)
            .toMatchObject({ resolutionSource: 'base', locale: 'es-ES' });
        expect(results[0].steps[0]).toContain('Dismissed 2 Bugbot findings');
        expect(results[0].errors).toHaveLength(1);
        expect(results[0].errors[0].message).toBe('A Bugbot finding could not be dismissed.');
    });

    it('is an idempotent no-op when no requested finding exists', async () => {
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });

        const results = await useCase.invoke({ operation: operation(), findingIds: ['missing'] });

        expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
        expect(results[0].steps[0]).toContain('nothing was dismissed');
    });

    it('uses the head fallback and PR override while ignoring an invalid finding id', async () => {
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });
        const request = operation();
        const fallbackOperation: BugbotContextSelectionContext = {
            ...request,
            target: {
                ...request.target,
                commitBranch: '',
                headBranch: 'feature/from-pr',
                pullRequestNumber: 19,
            },
        };

        const results = await useCase.invoke({ operation: fallbackOperation, findingIds: ['\n'] });

        expect(mockLoadBugbotContext).toHaveBeenCalledWith(expect.objectContaining({
            target: expect.objectContaining({
                headRef: 'feature/from-pr',
                pullRequestSelection: { kind: 'event', number: 19 },
            }),
        }), expect.anything());
        expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
        expect(results[0].success).toBe(true);
    });

    it('loads the default context when no commit or pull-request branch is available', async () => {
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });
        const request = operation();
        const branchlessOperation: BugbotContextSelectionContext = {
            ...request,
            target: {
                ...request.target,
                commitBranch: '',
                headBranch: '',
            },
        };

        const results = await useCase.invoke({ operation: branchlessOperation, findingIds: ['missing'] });

        expect(mockLoadBugbotContext.mock.calls[0][0].target.headRef).toBe('');
        expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
        expect(results[0].success).toBe(true);
    });

    it('returns a bounded semantic error when context loading fails', async () => {
        mockLoadBugbotContext.mockRejectedValueOnce(new Error('dismiss-secret-marker'));
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });

        const results = await useCase.invoke({ operation: operation(), findingIds: ['finding-1'] });

        expect(results[0]).toMatchObject({ success: false, executed: true });
        expect(results[0].errors[0].message).toBe('Unable to dismiss Bugbot findings.');
        expect(JSON.stringify(results)).not.toContain('dismiss-secret-marker');
    });
});
