import { DismissBugbotFindingsUseCase } from '../dismiss_bugbot_findings_use_case';

const mockLoadBugbotContext = jest.fn();
const mockMarkFindingsResolved = jest.fn();

jest.mock('../load_bugbot_context_use_case', () => ({
    loadBugbotContext: (...args: unknown[]) => mockLoadBugbotContext(...args),
}));
jest.mock('../mark_findings_resolved_workflow', () => ({
    markFindingsResolved: (...args: unknown[]) => mockMarkFindingsResolved(...args),
}));

function execution() {
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
    } as never;
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

        const results = await useCase.invoke({ operation: execution(), findingIds: ['finding-1', 'missing'] });

        expect(mockMarkFindingsResolved).toHaveBeenCalledWith(expect.objectContaining({
            resolvedFindingIds: new Set(['finding-1']),
        }));
        expect(results[0]).toMatchObject({ success: true, executed: true });
    });

    it('is an idempotent no-op when no requested finding exists', async () => {
        const useCase = new DismissBugbotFindingsUseCase({
            contextPorts: {} as never,
            resolutionPorts: {} as never,
        });

        const results = await useCase.invoke({ operation: execution(), findingIds: ['missing'] });

        expect(mockMarkFindingsResolved).not.toHaveBeenCalled();
        expect(results[0].steps[0]).toContain('nothing was dismissed');
    });
});
