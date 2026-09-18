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
import { ResolveMessageCatalogUseCase } from '../../application/usecases/localization/resolve_message_catalog_use_case';
import { createLanguageQueryPort } from './agent_capability_composition_root';
import type { MessageCatalogResolutionPort } from '../../application/ports/message_catalog_ports';
import { GithubSetupApprovalReadinessAdapter } from '../setup_approval_readiness_adapter';

export function createSetupMergeQueueReadinessUseCase(
    catalogResolver: MessageCatalogResolutionPort = new ResolveMessageCatalogUseCase(createLanguageQueryPort()),
): SetupMergeQueueReadinessUseCase {
    return new SetupMergeQueueReadinessUseCase(
        new GithubTargetMergeCapabilitiesInspector(new OctokitDeploymentClientAdapter()),
        catalogResolver,
    );
}

export function createSetupDoctorUseCase(): SetupDoctorUseCase {
    const repositoryConfiguration = new SetupRemoteConfigurationQueryRepository(createRepositoryVariablesClient());
    const catalogResolver = new ResolveMessageCatalogUseCase(createLanguageQueryPort());
    return new SetupDoctorUseCase({
        validation: new SetupCredentialValidationAdapter(),
        workspace: new SetupDoctorWorkspaceQueryAdapter(),
        remoteConfiguration: repositoryConfiguration,
        remoteHealth: new SetupRemoteCredentialHealthQueryAdapter(new OctokitCredentialHealthClientAdapter()),
        mergeQueueReadiness: createSetupMergeQueueReadinessUseCase(catalogResolver),
        approvalReadiness: new GithubSetupApprovalReadinessAdapter(),
        catalogResolver,
    });
}
