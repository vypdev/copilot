import type { SetupPromptPort, SetupRemoteConfigurationReadPort, SetupStoragePromptPort } from '../../ports/setup_wizard_ports';
import type { SetupConfiguration, SetupPlan, SetupRemoteConfiguration } from '../../../domain/setup';
import { type SetupConfigurationOverrides } from '../../policies/setup_configuration_policy';
export interface SetupWizardRequest {
    overrides?: SetupConfigurationOverrides;
    skipRepositoryVariables?: boolean;
    skipRepositorySecrets?: boolean;
    remoteTarget?: {
        owner: string;
        repository: string;
        token: string;
    };
}
export declare class SetupWizardUseCase {
    private readonly prompt;
    private readonly remoteConfigurationReader?;
    private readonly storagePrompt?;
    private lastRemoteConfiguration;
    constructor(prompt: SetupPromptPort, remoteConfigurationReader?: SetupRemoteConfigurationReadPort | undefined, storagePrompt?: SetupStoragePromptPort | undefined);
    collect(request?: SetupWizardRequest): Promise<SetupConfiguration | undefined>;
    plan(configuration: SetupConfiguration): SetupPlan;
    remoteConfiguration(): SetupRemoteConfiguration | undefined;
    close(): void;
}
