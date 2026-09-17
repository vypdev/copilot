import { SynchronizeAgentActivityUseCase } from '../synchronize_agent_activity_use_case';
import { projectAgentActivityContext } from '../../push_single_action_contexts';

function execution(overrides: Record<string, unknown> = {}): any {
    return {
        owner: 'owner',
        repo: 'repo',
        eventName: 'issues',
        issueNumber: 7,
        issue: { number: 7 },
        pullRequest: { number: 0 },
        labels: {
            currentIssueLabels: ['feature', 'state:working', 'state:awaiting-maintainer'],
            currentPullRequestLabels: [],
            lifecycle: {
                aiProcessing: 'state:ai-processing',
                planned: 'state:planned',
                specifying: 'state:specifying', working: 'state:working',
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
            'state:working',
            'state:awaiting-maintainer',
            'state:ai-processing',
            'size: M',
        ]);
        const param = execution();
        const useCase = new SynchronizeAgentActivityUseCase({ setLabels, getLabels });

        const context = projectAgentActivityContext(param);
        await useCase.start(context);
        await useCase.finish(context);

        expect(setLabels).toHaveBeenNthCalledWith(
            1,
            7,
            ['feature', 'state:working', 'state:awaiting-maintainer', 'state:ai-processing'],
        );
        expect(setLabels).toHaveBeenNthCalledWith(
            2,
            7,
            ['feature', 'state:working', 'state:awaiting-maintainer', 'size: M'],
        );
        expect(getLabels).toHaveBeenCalledWith(7);
    });

    it('keeps route execution best-effort when label synchronization fails', async () => {
        const setLabels = jest.fn().mockRejectedValue(new Error('labels unavailable'));
        const getLabels = jest.fn().mockRejectedValue(new Error('labels unavailable'));
        const useCase = new SynchronizeAgentActivityUseCase({ setLabels, getLabels });

        await expect(useCase.start(projectAgentActivityContext(execution()))).resolves.toEqual({});
        await expect(useCase.finish(projectAgentActivityContext(execution()))).resolves.toEqual({});
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

        await useCase.start(projectAgentActivityContext(param));

        expect(setLabels).toHaveBeenCalledWith(
            11,
            ['state:reviewing', 'state:ai-processing'],
        );
    });
});
