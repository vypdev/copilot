import type { SetupPromptPort } from '../../ports/setup_wizard_ports';
import type { SetupConfiguration, SetupPlan } from '../../../domain/setup';
import { type SetupConfigurationOverrides } from '../../policies/setup_configuration_policy';
export interface SetupWizardRequest {
    overrides?: SetupConfigurationOverrides;
    skipRepositoryVariables?: boolean;
}
export declare class SetupWizardUseCase {
    private readonly prompt;
    constructor(prompt: SetupPromptPort);
    collect(request?: SetupWizardRequest): Promise<SetupConfiguration | undefined>;
    plan(configuration: SetupConfiguration): SetupPlan;
    close(): void;
}
