import type { SetupCredentialCheck, SetupCredentialCollection, SetupCredentialRequirement } from '../../../domain/setup';
import type { SetupCredentialPromptPort, SetupCredentialValidationPort, SetupRepositorySecretsPort, SetupRemoteCredentialHealthPort } from '../../ports/setup_wizard_ports';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
export interface SetupCredentialsRequest {
    owner: string;
    repository: string;
    setupToken: string;
    requirements: readonly SetupCredentialRequirement[];
    manageSecrets: boolean;
    ref?: string;
    remoteConfiguration?: SetupRemoteConfiguration;
}
export interface SetupCredentialsResult {
    collection: SetupCredentialCollection;
    checks: SetupCredentialCheck[];
    existingSecretNames: readonly string[];
}
/** Coordinates secret collection and validation without placing secret values in config files. */
export declare class SetupCredentialsUseCase {
    private readonly prompt;
    private readonly validation;
    private readonly secrets?;
    private readonly remoteHealth?;
    constructor(prompt: SetupCredentialPromptPort, validation: SetupCredentialValidationPort, secrets?: SetupRepositorySecretsPort | undefined, remoteHealth?: SetupRemoteCredentialHealthPort | undefined);
    collect(request: SetupCredentialsRequest): Promise<SetupCredentialsResult>;
}
