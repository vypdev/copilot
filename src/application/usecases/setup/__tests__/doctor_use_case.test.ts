import { SetupDoctorUseCase } from '../doctor_use_case';
import { buildSetupCredentialRequirements, buildSetupRepositoryVariables, createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';

describe('SetupDoctorUseCase', () => {
    function createDependencies(overrides: Record<string, unknown> = {}) {
        const output = { showDoctorChecks: jest.fn() };
        const dependencies = {
            validation: { validateSetupPat: jest.fn().mockResolvedValue({ status: 'valid', message: 'ok' }), validateCredential: jest.fn() },
            secrets: { list: jest.fn().mockResolvedValue(['PAT', 'OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN']), upsertSecrets: jest.fn() },
            variables: { listVariables: jest.fn().mockResolvedValue([]) },
            workspace: { prepare: jest.fn(), hasValidToken: jest.fn(), compareWorkflows: jest.fn().mockReturnValue([]) },
            ...overrides,
        };
        return { output, dependencies };
    }

    it('reports missing variables/secrets and returns unhealthy without mutating', async () => {
        const { output, dependencies } = createDependencies();
        const healthy = await new SetupDoctorUseCase(
            dependencies.validation,
            dependencies.secrets,
            dependencies.variables,
            dependencies.workspace,
            output,
        ).execute({ owner: 'owner', repository: 'repo', setupToken: 'token', configuration: createDefaultSetupConfiguration() });

        expect(healthy).toBe(false);
        expect(output.showDoctorChecks).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ area: 'Variable AGENT_PROVIDER', status: 'fail' }),
            expect.objectContaining({ area: 'Secret PAT', status: 'warn' }),
        ]));
        expect(dependencies.variables.listVariables).toHaveBeenCalledTimes(1);
    });

    it('reports valid remote health and matching variables as healthy', async () => {
        const configuration = createDefaultSetupConfiguration();
        const variables = { listVariables: jest.fn() };
        variables.listVariables.mockResolvedValue(buildSetupRepositoryVariables(configuration));
        const requiredSecrets = buildSetupCredentialRequirements(configuration).map(requirement => requirement.name);
        const { output, dependencies } = createDependencies({
            variables,
            secrets: { list: jest.fn().mockResolvedValue(requiredSecrets), upsertSecrets: jest.fn() },
            workspace: { prepare: jest.fn(), hasValidToken: jest.fn(), compareWorkflows: jest.fn().mockReturnValue([]) },
        });
        const remoteHealth = {
            validateExisting: jest.fn().mockResolvedValue(requiredSecrets.map(name => ({ name, status: 'valid', message: 'remote ok' }))),
        };
        const healthy = await new SetupDoctorUseCase(
            dependencies.validation,
            dependencies.secrets,
            dependencies.variables,
            dependencies.workspace,
            output,
            remoteHealth,
        ).execute({ owner: 'owner', repository: 'repo', setupToken: 'token', configuration });
        expect(healthy).toBe(true);
        expect(output.showDoctorChecks).toHaveBeenCalled();
    });

    it('fails when an installed workflow or variable differs from the expected contract', async () => {
        const configuration = createDefaultSetupConfiguration();
        const variables = { listVariables: jest.fn().mockResolvedValue([{ name: 'AGENT_PROVIDER', value: 'cursor' }]) };
        const { output, dependencies } = createDependencies({
            variables,
            secrets: { list: jest.fn().mockResolvedValue([]), upsertSecrets: jest.fn() },
            workspace: {
                prepare: jest.fn(),
                hasValidToken: jest.fn(),
                compareWorkflows: jest.fn().mockReturnValue([{ file: 'copilot_issue.yml', destination: '.github/workflows/copilot_issue.yml', status: 'changed' }]),
            },
        });
        const healthy = await new SetupDoctorUseCase(
            dependencies.validation,
            dependencies.secrets,
            dependencies.variables,
            dependencies.workspace,
            output,
        ).execute({ owner: 'owner', repository: 'repo', setupToken: 'token', configuration });

        expect(healthy).toBe(false);
        expect(output.showDoctorChecks).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ area: 'Workflow copilot_issue.yml', status: 'fail' }),
            expect.objectContaining({ area: 'Variable AGENT_PROVIDER', status: 'fail' }),
        ]));
    });
});
