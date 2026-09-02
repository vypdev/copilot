import { SetupWizardUseCase } from '../setup_wizard_use_case';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import type { SetupPromptPort } from '../../../ports/setup_wizard_ports';

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
});
