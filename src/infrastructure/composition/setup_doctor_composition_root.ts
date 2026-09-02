import { SetupDoctorUseCase } from '../../application/usecases/setup/doctor_use_case';
import type { DoctorOutputPort } from '../../application/ports/setup_wizard_ports';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import { RepositoryVariablesRepository } from '../../data/repository/repository_variables_repository';
import { createRepositoryVariablesClient } from './github_identity_client_factory';
import { SetupWorkspaceAdapter } from '../setup_workspace_adapter';
import { SetupRemoteCredentialHealthAdapter } from '../setup_remote_credential_health_adapter';
import { OctokitCredentialHealthClientAdapter } from '../github/octokit_credential_health_adapter';

export function createSetupDoctorUseCase(output: DoctorOutputPort): SetupDoctorUseCase {
    const repositoryConfiguration = new RepositoryVariablesRepository(createRepositoryVariablesClient());
    return new SetupDoctorUseCase(
        new SetupCredentialValidationAdapter(),
        repositoryConfiguration,
        repositoryConfiguration,
        new SetupWorkspaceAdapter(),
        output,
        new SetupRemoteCredentialHealthAdapter(new OctokitCredentialHealthClientAdapter()),
    );
}
