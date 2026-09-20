import { SetupCredentialsUseCase } from '../../application/usecases/setup/setup_credentials_use_case';
import type { SetupCredentialPromptPort, SetupRemoteConfigurationReadPort } from '../../application/ports/setup_wizard_ports';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import {
    RepositorySecretNamesQueryRepository,
    SetupRemoteConfigurationQueryRepository,
} from '../../data/repository/repository_variables_repository';
import { createRepositoryVariablesClient } from './github_identity_client_factory';
import { SetupRemoteCredentialHealthBootstrapAdapter } from '../setup_remote_credential_health_adapter';
import { OctokitCredentialHealthClientAdapter } from '../github/octokit_credential_health_adapter';
import type { SetupTokenPermissionPresenterPort } from '../../application/ports/setup_token_permission_ports';
import { createSetupTokenPermissionsUseCase } from './setup_token_permissions_composition_root';

export function createSetupCredentialsUseCase(
    prompt: SetupCredentialPromptPort,
    permissionPresenter?: SetupTokenPermissionPresenterPort,
): SetupCredentialsUseCase {
    const secretNames = new RepositorySecretNamesQueryRepository(createRepositoryVariablesClient());
    return new SetupCredentialsUseCase(
        prompt,
        new SetupCredentialValidationAdapter(),
        secretNames,
        new SetupRemoteCredentialHealthBootstrapAdapter(new OctokitCredentialHealthClientAdapter()),
        createSetupTokenPermissionsUseCase(),
        permissionPresenter,
    );
}

export function createSetupRemoteConfigurationReadPort(): SetupRemoteConfigurationReadPort {
    return new SetupRemoteConfigurationQueryRepository(createRepositoryVariablesClient());
}
