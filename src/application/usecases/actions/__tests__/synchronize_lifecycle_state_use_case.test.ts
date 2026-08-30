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
            currentIssueLabels: ['bug', 'copilot:state:ready'],
            currentPullRequestLabels: [],
            lifecycle: {
                analyzing: 'copilot:state:analyzing', planned: 'copilot:state:planned', inProgress: 'copilot:state:in-progress',
                reviewing: 'copilot:state:reviewing', changesRequested: 'copilot:state:changes-requested', verified: 'copilot:state:verified', ready: 'copilot:state:ready', blocked: 'copilot:state:blocked',
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

        const results = await useCase.invoke({ execution: param, results: [] });

        expect(setLabels).toHaveBeenCalledWith('owner', 'repo', 7, ['bug', 'copilot:state:analyzing'], 'token');
        expect(results[0]).toMatchObject({ success: true, executed: true });
    });

    it('does not write when the state is already current', async () => {
        const setLabels = jest.fn();
        const useCase = new SynchronizeLifecycleStateUseCase({ setLabels, getLabels: jest.fn() });
        const param = execution({ labels: { ...execution().labels, currentIssueLabels: ['bug', 'copilot:state:analyzing'] } });

        expect(await useCase.invoke({ execution: param, results: [] })).toEqual([]);
        expect(setLabels).not.toHaveBeenCalled();
    });
});
