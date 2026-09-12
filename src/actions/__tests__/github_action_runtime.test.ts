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

    it('maps missing active-role authentication to a safe semantic error', () => {
        mockPreflight.mockReturnValue({
            check: { status: 'missing', message: 'secret-bearing provider diagnostic' },
            shouldFail: true,
            mode: 'required',
        });

        expect(() => prepareGithubAgentRuntime(tasks, ['planner'])).toThrow(
            expect.objectContaining({
                code: 'authorization.credential-invalid',
                message: 'Authentication is unavailable for the active planner agent role using opencode.',
            }),
        );
        try {
            prepareGithubAgentRuntime(tasks, ['planner']);
        } catch (error) {
            expect(JSON.stringify(error)).not.toContain('secret-bearing provider diagnostic');
        }
    });

    it('maps provisioning failures without exposing provider diagnostics', () => {
        mockProvision.mockImplementation(() => {
            throw new Error('secret-bearing provisioning diagnostic');
        });

        expect(() => prepareGithubAgentRuntime(tasks, ['planner'])).toThrow(
            expect.objectContaining({
                code: 'configuration.unsupported',
                message: 'The opencode runtime could not satisfy the exact manifest provisioning contract.',
            }),
        );
        try {
            prepareGithubAgentRuntime(tasks, ['planner']);
        } catch (error) {
            expect(JSON.stringify(error)).not.toContain('secret-bearing provisioning diagnostic');
        }
    });
});
