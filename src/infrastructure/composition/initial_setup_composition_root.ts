import { createAuthenticatedUserClient } from './github_identity_client_factory';
import { createIssueLabelProvisioningClient } from './github_issue_client_factory';
import { createGraphqlTransportClient } from './github_project_client_factory';
import { createReleaseClient } from './github_release_client_factory';
import { InitialSetupUseCase } from "../../application/usecases/actions/initial_setup_use_case";
import { IssueLabelProvisioningRepository } from "../../data/repository/issue/issue_label_provisioning_repository";

import { IssueTypeRepository } from "../../data/repository/issue/issue_type_repository";
import { AuthenticatedUserRepository } from "../../data/repository/organization/authenticated_user_repository";
import { RepositoryDefaultBranchRepository } from "../../data/repository/release/repository_default_branch_repository";
import { RepositoryTagRepository } from "../../data/repository/release/repository_tag_repository";
import { GitCliRepository } from "../../data/repository/git_cli_repository";
import { composeInitialSetupUseCase } from "./initial_setup_use_case_composition";
import { SetupWorkspaceMutationAdapter } from "../setup_workspace_adapter";
import {
    RepositorySecretsCommandRepository,
    RepositoryVariablesCommandRepository,
    SetupRemoteConfigurationQueryRepository,
} from '../../data/repository/repository_variables_repository';
import { createRepositoryVariablesClient } from './github_identity_client_factory';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import {
    bindAuthenticatedUser,
    bindInitialLabels,
    bindIssueTypes,
    bindRepositoryDefaultBranch,
    bindRepositoryTag,
    bindSetupRemoteConfiguration,
    bindSetupSecrets,
    bindSetupVariables,
    bindSetupWorkspace,
} from './push_single_action_capability_port_binding';

export function createInitialSetupCompositionRoot(binding: RepositoryCredentialBinding): InitialSetupUseCase {
    const labelProvisioning = new IssueLabelProvisioningRepository(
        createIssueLabelProvisioningClient(),
    );

    const githubResourceClient = createRepositoryVariablesClient();
    return composeInitialSetupUseCase(
        bindAuthenticatedUser(new AuthenticatedUserRepository(createAuthenticatedUserClient()), binding),
        bindInitialLabels(labelProvisioning, binding),
        bindIssueTypes(new IssueTypeRepository(createGraphqlTransportClient()), binding),
        new GitCliRepository(),
        bindRepositoryDefaultBranch(new RepositoryDefaultBranchRepository(createReleaseClient()), binding),
        bindRepositoryTag(new RepositoryTagRepository(createReleaseClient()), binding),
        bindSetupWorkspace(new SetupWorkspaceMutationAdapter(), binding),
        bindSetupVariables(new RepositoryVariablesCommandRepository(githubResourceClient), binding),
        bindSetupSecrets(new RepositorySecretsCommandRepository(githubResourceClient), binding),
        bindSetupRemoteConfiguration(new SetupRemoteConfigurationQueryRepository(githubResourceClient), binding),
    );
}
