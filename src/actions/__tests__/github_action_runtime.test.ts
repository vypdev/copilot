import { prepareGithubAgentRuntime } from '../github_action_runtime';
import type { AgentTaskConfiguration } from '../../domain/agent';
import { OfficialAgentInstallationError } from '../../infrastructure/agents/agent_official_installer';
import { AgentCliError } from '../../data/repository/agent_cli_contracts';
import { logInfo, logDebugInfo } from '../../utils/logger';

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
        mockProvision.mockReset();
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
        expect(mockPreflight.mock.invocationCallOrder[0]).toBeLessThan(mockProvision.mock.invocationCallOrder[0]);
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
        expect(mockProvision).not.toHaveBeenCalled();
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
                message: 'The opencode runtime is unavailable or its official installation failed.',
            }),
        );
        try {
            prepareGithubAgentRuntime(tasks, ['planner']);
        } catch (error) {
            expect(JSON.stringify(error)).not.toContain('secret-bearing provisioning diagnostic');
        }
    });

    it('logs only the closed installer stage and exit code', () => {
        mockProvision.mockImplementation(() => {
            throw new OfficialAgentInstallationError('installer-script', 'Official agent installer script failed.',
                1, new Error('secret-bearing installer stderr'), 'hash-module');
        });

        expect(() => prepareGithubAgentRuntime(tasks, ['findings'])).toThrow(
            expect.objectContaining({ code: 'configuration.unsupported' }),
        );
        expect(logInfo).toHaveBeenCalledWith('Agent runtime codex provisioning failed (official-installer-script-exit-1-hash-module).');
        expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('secret-bearing');
    });

    it('logs the installed-file category without exposing its underlying ACL diagnostic', () => {
        mockProvision.mockImplementation(() => {
            throw new OfficialAgentInstallationError('installed-file', 'Official agent installation failed.',
                undefined, new Error('secret-bearing runner path and principal'), 'acl-ancestor');
        });

        expect(() => prepareGithubAgentRuntime(tasks, ['findings'])).toThrow(
            expect.objectContaining({ code: 'configuration.unsupported' }),
        );
        expect(logInfo).toHaveBeenCalledWith('Agent runtime codex provisioning failed (official-installed-file-acl-ancestor).');
        expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('secret-bearing');
    });

    it('logs the installer stage when no optional diagnostic reason is available', () => {
        mockProvision.mockImplementation(() => {
            throw new OfficialAgentInstallationError('download', 'secret-bearing installer diagnostic');
        });

        expect(() => prepareGithubAgentRuntime(tasks, ['findings'])).toThrow(
            expect.objectContaining({ code: 'configuration.unsupported' }),
        );
        expect(logInfo).toHaveBeenCalledWith('Agent runtime codex provisioning failed (official-download).');
        expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('secret-bearing');
    });

    it.each([true, false])('logs only a bounded replacement-trust diagnostic when present=%s', hasDiagnostic => {
        const failure = new AgentCliError('secret-bearing replacement diagnostic', 'configuration');
        if (hasDiagnostic) failure.preflightDiagnostic = 'acl-writable';
        mockProvision.mockImplementation(() => { throw failure; });

        expect(() => prepareGithubAgentRuntime(tasks, ['findings'])).toThrow(
            expect.objectContaining({ code: 'configuration.unsupported' }),
        );
        expect(logInfo).toHaveBeenCalledWith(`Agent runtime codex provisioning failed (${hasDiagnostic
            ? 'replacement-trust-acl-writable' : 'unavailable'}).`);
        expect(JSON.stringify((logInfo as jest.Mock).mock.calls)).not.toContain('secret-bearing');
    });

    it('continues provisioning after a non-blocking authentication warning', () => {
        mockPreflight.mockReturnValue({
            check: { status: 'missing', message: 'No local authentication is available.' },
            shouldFail: false,
            mode: 'warn',
        });

        prepareGithubAgentRuntime(tasks, ['planner']);

        expect(logInfo).toHaveBeenCalledWith('Warning: planner agent authentication could not be preflighted: No local authentication is available.');
        expect(mockProvision).toHaveBeenCalledWith(tasks.planner);
    });

    it('preflights configured roles outside Actions without installing and ignores absent optional roles', () => {
        process.env.GITHUB_ACTIONS = 'false';
        const findings = { ...tasks.findings, modelProvider: undefined };

        prepareGithubAgentRuntime({ findings, fixer: tasks.fixer, planner: undefined });

        expect(mockPreflight.mock.calls).toEqual([[findings], [tasks.fixer]]);
        expect(mockProvision).not.toHaveBeenCalled();
        expect(logDebugInfo).toHaveBeenCalledWith(expect.stringContaining('findings=codex/default/findings'));
    });

    it('uses the findings configuration for an active role without its own override', () => {
        prepareGithubAgentRuntime(tasks, ['tester']);

        expect(mockPreflight).toHaveBeenCalledWith(tasks.findings);
        expect(mockProvision).toHaveBeenCalledWith(tasks.findings);
        expect(logDebugInfo).toHaveBeenCalledWith(expect.stringContaining('tester=codex/openai/findings'));
    });
});
