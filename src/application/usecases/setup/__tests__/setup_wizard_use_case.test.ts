import { SetupWizardUseCase } from '../setup_wizard_use_case';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import type { SetupPromptPort, SetupRemoteConfigurationReadPort, SetupStoragePromptPort } from '../../../ports/setup_wizard_ports';
import type { SetupCredentialRequirement, SetupRemoteConfiguration, SetupStorageConfiguration, SetupVariable } from '../../../../domain/setup';

describe('SetupWizardUseCase', () => {
    it('validates, previews, and confirms the collected configuration', async () => {
        const prompt: jest.Mocked<SetupPromptPort> = {
            collect: jest.fn(async defaults => defaults),
            showPlan: jest.fn(),
            confirm: jest.fn(async (_plan) => true),
            close: jest.fn(),
        };
        const useCase = new SetupWizardUseCase(prompt);

        const result = await useCase.collect();

        expect(result).toEqual(createDefaultSetupConfiguration());
        expect(prompt.showPlan).toHaveBeenCalledTimes(1);
        expect(prompt.confirm).toHaveBeenCalledTimes(1);
    });

    it('honors skipRepositoryVariables even if a prompt adapter returns true', async () => {
        const prompt: jest.Mocked<SetupPromptPort> = {
            collect: jest.fn(async defaults => ({ ...defaults, manageRepositoryVariables: true })),
            showPlan: jest.fn(),
            confirm: jest.fn(async (_plan) => true),
            close: jest.fn(),
        };

        const result = await new SetupWizardUseCase(prompt).collect({ skipRepositoryVariables: true });

        expect(result?.manageRepositoryVariables).toBe(false);
    });

    it('does not apply a plan when confirmation is declined', async () => {
        const prompt: jest.Mocked<SetupPromptPort> = {
            collect: jest.fn(async defaults => defaults),
            showPlan: jest.fn(),
            confirm: jest.fn(async (_plan) => false),
            close: jest.fn(),
        };

        await expect(new SetupWizardUseCase(prompt).collect()).resolves.toBeUndefined();
    });

    it('inspects the remote repository and collects independent storage decisions', async () => {
        const prompt: jest.Mocked<SetupPromptPort> = {
            collect: jest.fn(async defaults => defaults),
            showPlan: jest.fn(), confirm: jest.fn(async (_plan) => true), close: jest.fn(),
        };
        const remote = {
            ownerType: 'Organization' as const, repositoryId: 7, repositoryVisibility: 'private' as const,
            repositorySecrets: [], organizationSecrets: ['PAT'], repositoryVariables: [],
            organizationVariables: [{ name: 'AGENT_PROVIDER', value: 'codex' }],
            organizationAccess: 'available' as const, organizationSecretsAccess: 'available' as const,
            organizationVariablesAccess: 'available' as const,
        };
        const reader: jest.Mocked<SetupRemoteConfigurationReadPort> = { inspect: jest.fn().mockResolvedValue(remote) };
        const storagePrompt: jest.Mocked<SetupStoragePromptPort> = {
            chooseStorage: jest.fn(async (
                defaults: SetupStorageConfiguration,
                _remote: SetupRemoteConfiguration,
                _variables: readonly SetupVariable[],
                _requirements: readonly SetupCredentialRequirement[],
                _managed?: { secrets: boolean; variables: boolean },
            ): Promise<SetupStorageConfiguration> => ({
                ...defaults,
                secrets: { ...defaults.secrets, defaultScope: 'organization' as const },
                variables: { ...defaults.variables, defaultScope: 'organization' as const },
            })),
        };

        const result = await new SetupWizardUseCase(prompt, reader, storagePrompt).collect({
            remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
        });

        expect(result?.storage.secrets.defaultScope).toBe('organization');
        expect(result?.storage.variables.defaultScope).toBe('organization');
        expect(reader.inspect).toHaveBeenCalledWith('owner', 'repo', 'token');
        expect(storagePrompt.chooseStorage).toHaveBeenCalledWith(
            expect.anything(), remote, expect.any(Array), expect.any(Array),
            { secrets: true, variables: true },
        );
    });

    it('adds live merge-queue readiness to the setup plan when a remote target is available', async () => {
        const prompt: jest.Mocked<SetupPromptPort> = {
            collect: jest.fn(async defaults => defaults),
            showPlan: jest.fn(), confirm: jest.fn(async (_plan) => true), close: jest.fn(),
        };
        const readiness = {
            inspect: jest.fn().mockResolvedValue([
                { area: 'Merge queue readiness · production (master)', status: 'pass', message: 'Ready.' },
            ]),
        };
        await new SetupWizardUseCase(prompt, undefined, undefined, readiness).collect({
            remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
        });
        expect(readiness.inspect).toHaveBeenCalledWith(expect.objectContaining({ owner: 'owner', repository: 'repo' }));
        expect(prompt.showPlan).toHaveBeenCalledWith(expect.objectContaining({
            mergeQueueReadiness: [expect.objectContaining({ status: 'pass' })],
        }));
    });
});
