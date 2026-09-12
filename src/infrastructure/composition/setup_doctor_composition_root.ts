import { SetupDoctorUseCase } from '../../application/usecases/setup/doctor_use_case';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import { SetupRemoteConfigurationQueryRepository } from '../../data/repository/repository_variables_repository';
import { createRepositoryVariablesClient } from './github_identity_client_factory';
import { SetupDoctorWorkspaceQueryAdapter } from '../setup_workspace_adapter';
import { SetupRemoteCredentialHealthQueryAdapter } from '../setup_remote_credential_health_adapter';
import { OctokitCredentialHealthClientAdapter } from '../github/octokit_credential_health_adapter';
import { GithubTargetMergeCapabilitiesInspector } from '../../data/repository/deployment/github_target_merge_capabilities_inspector';
import { OctokitDeploymentClientAdapter } from '../github/octokit_deployment_adapter';
import { SetupMergeQueueReadinessUseCase } from '../../application/usecases/setup/merge_queue_readiness_use_case';

export function createSetupMergeQueueReadinessUseCase(): SetupMergeQueueReadinessUseCase {
    return new SetupMergeQueueReadinessUseCase(
        new GithubTargetMergeCapabilitiesInspector(new OctokitDeploymentClientAdapter()),
    );
}

export function createSetupDoctorUseCase(): SetupDoctorUseCase {
    const repositoryConfiguration = new SetupRemoteConfigurationQueryRepository(createRepositoryVariablesClient());
    return new SetupDoctorUseCase({
        validation: new SetupCredentialValidationAdapter(),
        workspace: new SetupDoctorWorkspaceQueryAdapter(),
        remoteConfiguration: repositoryConfiguration,
        remoteHealth: new SetupRemoteCredentialHealthQueryAdapter(new OctokitCredentialHealthClientAdapter()),
        mergeQueueReadiness: createSetupMergeQueueReadinessUseCase(),
    });
}
