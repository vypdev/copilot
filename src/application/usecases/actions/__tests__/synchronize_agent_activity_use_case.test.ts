import { SynchronizeAgentActivityUseCase } from '../synchronize_agent_activity_use_case';

function execution(overrides: Record<string, unknown> = {}): any {
    return {
        owner: 'owner',
        repo: 'repo',
        eventName: 'issues',
        issueNumber: 7,
        issue: { number: 7 },
        pullRequest: { number: 0 },
        labels: {
            currentIssueLabels: ['feature', 'state:in-progress', 'state:awaiting-maintainer'],
            currentPullRequestLabels: [],
            lifecycle: {
                aiProcessing: 'state:ai-processing',
                planned: 'state:planned',
                inProgress: 'state:in-progress',
                reviewing: 'state:reviewing',
                changesRequested: 'state:changes-requested',
                verified: 'state:verified',
                ready: 'state:ready',
                blocked: 'state:blocked',
                awaitingMaintainer: 'state:awaiting-maintainer',
                awaitingIssueAuthor: 'state:awaiting-issue-author',
            },
        },
        tokens: { token: 'token' },
        ...overrides,
    };
}

describe('SynchronizeAgentActivityUseCase', () => {
    it('adds and removes the activity label while preserving other labels', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const getLabels = jest.fn().mockResolvedValue([
            'feature',
            'state:in-progress',
            'state:awaiting-maintainer',
            'state:ai-processing',
            'size: M',
        ]);
        const param = execution();
        const useCase = new SynchronizeAgentActivityUseCase({ setLabels, getLabels });

        await useCase.start(param);
        await useCase.finish(param);

        expect(setLabels).toHaveBeenNthCalledWith(
            1,
            'owner',
            'repo',
            7,
            ['feature', 'state:in-progress', 'state:awaiting-maintainer', 'state:ai-processing'],
            'token',
        );
        expect(setLabels).toHaveBeenNthCalledWith(
            2,
            'owner',
            'repo',
            7,
            ['feature', 'state:in-progress', 'state:awaiting-maintainer', 'size: M'],
            'token',
        );
        expect(getLabels).toHaveBeenCalledWith('owner', 'repo', 7, 'token');
    });

    it('keeps route execution best-effort when label synchronization fails', async () => {
        const setLabels = jest.fn().mockRejectedValue(new Error('labels unavailable'));
        const getLabels = jest.fn().mockRejectedValue(new Error('labels unavailable'));
        const useCase = new SynchronizeAgentActivityUseCase({ setLabels, getLabels });

        await expect(useCase.start(execution())).resolves.toBeUndefined();
        await expect(useCase.finish(execution())).resolves.toBeUndefined();
    });

    it('targets pull request labels for pull request review comments', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const param = execution({
            eventName: 'pull_request_review_comment',
            issueNumber: -1,
            issue: { number: -1 },
            pullRequest: { number: 11 },
            labels: {
                ...execution().labels,
                currentIssueLabels: [],
                currentPullRequestLabels: ['state:reviewing'],
            },
        });
        const useCase = new SynchronizeAgentActivityUseCase({ setLabels, getLabels: jest.fn() });

        await useCase.start(param);

        expect(setLabels).toHaveBeenCalledWith(
            'owner',
            'repo',
            11,
            ['state:reviewing', 'state:ai-processing'],
            'token',
        );
    });
});
