import { prepareGithubAgentRuntime } from '../github_action_runtime';
import type { AgentTaskConfiguration } from '../../domain/agent';

const mockPreflight = jest.fn();
const mockProvision = jest.fn();

jest.mock('../../data/repository/agent_authentication_preflight', () => ({
    runAgentAuthenticationPreflight: (...args: unknown[]) => mockPreflight(...args),
}));
jest.mock('../../data/repository/agent_cli_provisioner', () => ({
    AgentCliProvisioner: jest.fn().mockImplementation(() => ({ provision: mockProvision })),
}));
jest.mock('../../utils/logger', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn() }));

const tasks: AgentTaskConfiguration = {
    findings: { provider: 'codex', modelProvider: 'openai', model: 'findings' },
    fixer: { provider: 'codex', modelProvider: 'openai', model: 'fixer' },
    planner: { provider: 'opencode', modelProvider: 'anthropic', model: 'planner' },
};

describe('prepareGithubAgentRuntime', () => {
    const originalGithubActions = process.env.GITHUB_ACTIONS;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.GITHUB_ACTIONS = 'true';
        mockPreflight.mockReturnValue({
            check: { status: 'available', message: 'available' },
            shouldFail: false,
            mode: 'strict',
        });
    });

    afterAll(() => {
        if (originalGithubActions === undefined) delete process.env.GITHUB_ACTIONS;
        else process.env.GITHUB_ACTIONS = originalGithubActions;
    });

    it('authenticates and provisions only active roles', () => {
        prepareGithubAgentRuntime(tasks, ['planner']);

        expect(mockPreflight).toHaveBeenCalledTimes(1);
        expect(mockPreflight).toHaveBeenCalledWith(tasks.planner);
        expect(mockProvision).toHaveBeenCalledTimes(1);
        expect(mockProvision).toHaveBeenCalledWith(tasks.planner);
    });

    it('does no provider work for an event without agent capabilities', () => {
        prepareGithubAgentRuntime(tasks, []);

        expect(mockPreflight).not.toHaveBeenCalled();
        expect(mockProvision).not.toHaveBeenCalled();
    });

    it('deduplicates identical configurations across active roles', () => {
        prepareGithubAgentRuntime({ ...tasks, planner: tasks.findings }, ['findings', 'planner']);

        expect(mockPreflight).toHaveBeenCalledTimes(2);
        expect(mockProvision).toHaveBeenCalledTimes(1);
    });
});
