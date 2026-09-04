import { SetupCredentialsUseCase } from '../../application/usecases/setup/setup_credentials_use_case';
import type { SetupCredentialPromptPort, SetupRemoteConfigurationReadPort } from '../../application/ports/setup_wizard_ports';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import { RepositoryVariablesRepository } from '../../data/repository/repository_variables_repository';
import { createRepositoryVariablesClient } from './github_identity_client_factory';
import { SetupRemoteCredentialHealthAdapter } from '../setup_remote_credential_health_adapter';
import { OctokitCredentialHealthClientAdapter } from '../github/octokit_credential_health_adapter';

export function createSetupCredentialsUseCase(prompt: SetupCredentialPromptPort): SetupCredentialsUseCase {
    const repositoryConfiguration = new RepositoryVariablesRepository(createRepositoryVariablesClient());
    return new SetupCredentialsUseCase(
        prompt,
        new SetupCredentialValidationAdapter(),
        repositoryConfiguration,
        new SetupRemoteCredentialHealthAdapter(new OctokitCredentialHealthClientAdapter(), { bootstrapWhenMissing: true }),
    );
}

export function createSetupRemoteConfigurationReadPort(): SetupRemoteConfigurationReadPort {
    return new RepositoryVariablesRepository(createRepositoryVariablesClient());
}
