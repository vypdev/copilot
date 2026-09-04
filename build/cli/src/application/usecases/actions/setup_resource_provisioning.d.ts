import type { SetupConfiguration, SetupCredentialCollection, SetupRemoteConfiguration, SetupResourceTarget } from '../../../domain/setup';
import type { SetupRemoteConfigurationReadPort, SetupRepositorySecretsPort, SetupRepositoryVariablesPort } from '../../ports/setup_wizard_ports';
export interface SetupResourceProvisioningDependencies {
    setupRepositoryVariablesPort?: SetupRepositoryVariablesPort;
    setupRepositorySecretsPort?: SetupRepositorySecretsPort;
    setupRemoteConfigurationReadPort?: SetupRemoteConfigurationReadPort;
}
export interface SetupRepositoryContext {
    owner: string;
    repo: string;
    token: string;
    setupCredentials?: SetupCredentialCollection;
    setupRemoteConfiguration?: SetupRemoteConfiguration;
}
export type SetupResource = {
    name: string;
    value: string;
};
export type SetupResourceGroup = {
    target: SetupResourceTarget;
    resources: SetupResource[];
};
export declare function ensureRepositoryVariables(context: SetupRepositoryContext, dependencies: SetupResourceProvisioningDependencies, setupConfiguration?: SetupConfiguration, remoteConfiguration?: SetupRemoteConfiguration): Promise<{
    step?: string;
    errors: string[];
}>;
export declare function ensureRepositorySecrets(context: SetupRepositoryContext, dependencies: SetupResourceProvisioningDependencies, setupConfiguration?: SetupConfiguration, remoteConfiguration?: SetupRemoteConfiguration): Promise<{
    step?: string;
    errors: string[];
}>;
export declare function resolveRemoteConfiguration(context: SetupRepositoryContext, dependencies: SetupResourceProvisioningDependencies, setupConfiguration: SetupConfiguration | undefined, errors: string[]): Promise<SetupRemoteConfiguration | undefined>;
/** Groups resources by their resolved storage target so each provider call is scoped explicitly. */
export declare function groupSetupResources(resources: readonly SetupResource[], kind: 'secret' | 'variable', configuration: SetupConfiguration, remoteConfiguration?: SetupRemoteConfiguration): SetupResourceGroup[];
