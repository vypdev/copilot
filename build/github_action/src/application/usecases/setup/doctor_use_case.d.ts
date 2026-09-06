import type { SetupConfiguration } from '../../../domain/setup';
import type { DoctorOutputPort, SetupCredentialValidationPort, SetupRepositoryConfigurationReadPort, SetupRepositorySecretsPort, SetupRemoteConfigurationReadPort, SetupRemoteCredentialHealthPort } from '../../ports/setup_wizard_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
export interface DoctorRequest {
    owner: string;
    repository: string;
    setupToken: string;
    configuration: SetupConfiguration;
}
export declare class SetupDoctorUseCase {
    private readonly validation;
    private readonly secrets;
    private readonly variables;
    private readonly workspace;
    private readonly output;
    private readonly remoteHealth?;
    private readonly remoteConfigurationReader?;
    constructor(validation: SetupCredentialValidationPort, secrets: SetupRepositorySecretsPort, variables: SetupRepositoryConfigurationReadPort, workspace: SetupWorkspacePort, output: DoctorOutputPort, remoteHealth?: SetupRemoteCredentialHealthPort | undefined, remoteConfigurationReader?: SetupRemoteConfigurationReadPort | undefined);
    execute(request: DoctorRequest): Promise<boolean>;
}
