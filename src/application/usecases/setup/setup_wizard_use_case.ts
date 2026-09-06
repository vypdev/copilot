import type {
    SetupPromptPort,
    SetupRemoteConfigurationReadPort,
    SetupStoragePromptPort,
} from '../../ports/setup_wizard_ports';
import { ApplicationError } from '../../errors/application_error';
import type { SetupConfiguration, SetupPlan, SetupRemoteConfiguration } from '../../../domain/setup';
import {
    buildSetupCredentialRequirements,
    buildSetupRepositoryVariables,
    buildSetupPlan,
    createDefaultSetupConfiguration,
    getSetupStorageConfiguration,
    mergeSetupConfiguration,
    validateSetupStorageAgainstRemote,
    validateSetupConfiguration,
    type SetupConfigurationOverrides,
} from '../../policies/setup_configuration_policy';

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

export class SetupWizardUseCase {
    private lastRemoteConfiguration: SetupRemoteConfiguration | undefined;

    constructor(
        private readonly prompt: SetupPromptPort,
        private readonly remoteConfigurationReader?: SetupRemoteConfigurationReadPort,
        private readonly storagePrompt?: SetupStoragePromptPort,
    ) {}

    async collect(request: SetupWizardRequest = {}): Promise<SetupConfiguration | undefined> {
        this.lastRemoteConfiguration = undefined;
        const defaults = mergeSetupConfiguration(
            createDefaultSetupConfiguration(),
            {
                ...request.overrides,
                ...(request.skipRepositoryVariables ? { manageRepositoryVariables: false } : {}),
                ...(request.skipRepositorySecrets ? { manageRepositorySecrets: false } : {}),
            },
        );
        const collected = await this.prompt.collect(defaults);
        let configuration = {
            ...collected,
            ...(request.skipRepositoryVariables ? { manageRepositoryVariables: false } : {}),
            ...(request.skipRepositorySecrets ? { manageRepositorySecrets: false } : {}),
        };
        if (request.remoteTarget && this.remoteConfigurationReader && this.storagePrompt) {
            const remote = await this.remoteConfigurationReader.inspect(
                request.remoteTarget.owner,
                request.remoteTarget.repository,
                request.remoteTarget.token,
            );
            this.lastRemoteConfiguration = remote;
            const storage = await this.storagePrompt.chooseStorage(
                getSetupStorageConfiguration(configuration),
                remote,
                buildSetupRepositoryVariables(configuration),
                buildSetupCredentialRequirements(configuration),
                {
                    secrets: configuration.manageRepositorySecrets,
                    variables: configuration.manageRepositoryVariables,
                },
            );
            configuration = { ...configuration, storage };
            const remoteErrors = validateSetupStorageAgainstRemote(configuration, remote);
            if (remoteErrors.length > 0) {
                throw new ApplicationError(
                    `Invalid remote storage configuration:\n${remoteErrors.map(error => `- ${error}`).join('\n')}`,
                    'authorization',
                );
            }
        }
        const validationErrors = validateSetupConfiguration(configuration);
        if (validationErrors.length > 0) {
            throw new ApplicationError(
                `Invalid setup configuration:\n${validationErrors.map(error => `- ${error}`).join('\n')}`,
                'validation',
            );
        }
        const plan = buildSetupPlan(configuration);
        this.prompt.showPlan(plan);
        if (!(await this.prompt.confirm(plan))) return undefined;
        return configuration;
    }

    plan(configuration: SetupConfiguration): SetupPlan {
        return buildSetupPlan(configuration);
    }

    remoteConfiguration(): SetupRemoteConfiguration | undefined {
        return this.lastRemoteConfiguration;
    }

    close(): void {
        this.prompt.close();
    }
}
