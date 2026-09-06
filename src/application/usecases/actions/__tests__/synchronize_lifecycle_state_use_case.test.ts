import { SynchronizeLifecycleStateUseCase } from '../synchronize_lifecycle_state_use_case';
import type { Execution } from '../../../../data/model/execution';

function execution(overrides: Record<string, unknown> = {}): Execution {
    return {
        owner: 'owner',
        repo: 'repo',
        eventName: 'issues',
        inputs: { action: 'opened' },
        issue: { number: 7, opened: true, descriptionEdited: false },
        pullRequest: { number: 0, isMerged: false, isClosed: false },
        labels: {
            currentIssueLabels: ['bug', 'state:ready'],
            currentPullRequestLabels: [],
            lifecycle: {
                aiProcessing: 'state:ai-processing', planned: 'state:planned', inProgress: 'state:in-progress',
                reviewing: 'state:reviewing', changesRequested: 'state:changes-requested', verified: 'state:verified', ready: 'state:ready', blocked: 'state:blocked',
                awaitingMaintainer: 'state:awaiting-maintainer', awaitingIssueAuthor: 'state:awaiting-issue-author',
            },
        },
        tokens: { token: 'token' },
        ...overrides,
    } as unknown as Execution;
}

describe('SynchronizeLifecycleStateUseCase', () => {
    it('replaces only the managed lifecycle label', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels: jest.fn() });
        const param = execution();

        const results = await useCase.invoke({
            execution: param,
            results: [{ id: 'RecommendStepsUseCase', success: true, executed: true, steps: [], errors: [] } as never],
        });

        expect(setLabels).toHaveBeenCalledWith('owner', 'repo', 7, ['bug', 'state:planned', 'state:awaiting-maintainer'], 'token');
        expect(results[0]).toMatchObject({ success: true, executed: true });
    });

    it('does not write when the state is already current', async () => {
        const setLabels = jest.fn();
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels: jest.fn() });
        const param = execution({ labels: { ...execution().labels, currentIssueLabels: ['bug', 'state:ai-processing'] } });

        expect(await useCase.invoke({ execution: param, results: [] })).toEqual([]);
        expect(setLabels).not.toHaveBeenCalled();
    });

    it('preserves agent activity while synchronizing the stable state', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const getLabels = jest.fn().mockResolvedValue(['bug', 'state:ai-processing', 'state:ready', 'size: M']);
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels });
        const param = execution({
            labels: {
                ...execution().labels,
                currentIssueLabels: ['bug', 'state:ai-processing', 'state:ready'],
            },
            issue: { number: 7, opened: false, descriptionEdited: true },
            inputs: { action: 'edited' },
        });

        await useCase.invoke({
            execution: param,
            results: [{ id: 'PrepareBranchesUseCase', success: true, executed: true, steps: [], errors: [] } as never],
        });

        expect(setLabels).toHaveBeenCalledWith(
            'owner',
            'repo',
            7,
            ['bug', 'state:ai-processing', 'size: M', 'state:in-progress'],
            'token',
        );
    });

    it('does not migrate legacy copilot-prefixed labels automatically', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels: jest.fn() });
        const param = execution({
            labels: {
                ...execution().labels,
                currentIssueLabels: ['bug', 'copilot:state:ready'],
            },
        });

        await useCase.invoke({
            execution: param,
            results: [{ id: 'RecommendStepsUseCase', success: true, executed: true, steps: [], errors: [] } as never],
        });

        expect(setLabels).toHaveBeenCalledWith(
            'owner',
            'repo',
            7,
            ['bug', 'copilot:state:ready', 'state:planned', 'state:awaiting-maintainer'],
            'token',
        );
    });

    it('maps active findings to the issue-author waiting label', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels: jest.fn() });
        const param = execution({
            eventName: 'pull_request',
            inputs: { action: 'synchronize' },
            pullRequest: { number: 11, isMerged: false, isClosed: false },
            labels: {
                ...execution().labels,
                currentIssueLabels: [],
                currentPullRequestLabels: ['state:ai-processing', 'state:reviewing'],
            },
        });

        await useCase.invoke({
            execution: param,
            results: [{ id: 'DetectPotentialProblemsUseCase', success: true, executed: true, steps: [], errors: [], payload: { findingStates: { open: 1, reopened: 0 } } } as never],
        });

        expect(setLabels).toHaveBeenCalledWith(
            'owner',
            'repo',
            11,
            ['state:ai-processing', 'state:changes-requested', 'state:awaiting-issue-author'],
            'token',
        );
    });

    it('clears a waiting label when a pull request review comment arrives', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels: jest.fn() });
        const param = execution({
            eventName: 'pull_request_review_comment',
            inputs: { action: 'created' },
            issue: { number: -1, opened: false, descriptionEdited: false },
            pullRequest: { number: 11, isMerged: false, isClosed: false },
            labels: {
                ...execution().labels,
                currentIssueLabels: [],
                currentPullRequestLabels: ['state:changes-requested', 'state:awaiting-issue-author'],
            },
        });

        await useCase.invoke({ execution: param, results: [] });

        expect(setLabels).toHaveBeenCalledWith(
            'owner',
            'repo',
            11,
            ['state:changes-requested'],
            'token',
        );
    });

    it('synchronizes check-suite evidence for a PR without invoking the agent route', async () => {
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const useCase = new SynchronizeLifecycleStateUseCase(
            { setLabels, getLabels: jest.fn() },
            { getPullRequestHeadSha: jest.fn().mockResolvedValue('sha-1') },
        );
        const param = execution({
            eventName: 'check_suite',
            inputs: {
                eventName: 'check_suite',
                action: 'completed',
                check_suite: {
                    workflow_name: 'CI Check',
                    head_sha: 'sha-1',
                    status: 'completed',
                    conclusion: 'failure',
                    pull_requests: [{ number: 11 }],
                },
            },
            issue: { number: -1, opened: false, descriptionEdited: false },
            pullRequest: { number: 11, isMerged: false, isClosed: false },
            labels: {
                ...execution().labels,
                currentIssueLabels: [],
                currentPullRequestLabels: ['state:reviewing'],
            },
        });

        await useCase.invoke({ execution: param, results: [] });

        expect(setLabels).toHaveBeenCalledWith('owner', 'repo', 11, ['state:blocked', 'state:awaiting-maintainer'], 'token');
    });
});
