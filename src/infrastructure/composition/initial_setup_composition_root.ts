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
import { SetupWorkspaceAdapter } from "../setup_workspace_adapter";
import { RepositoryVariablesRepository } from '../../data/repository/repository_variables_repository';
import { createRepositoryVariablesClient } from './github_identity_client_factory';

export function createInitialSetupCompositionRoot(): InitialSetupUseCase {
    const labelProvisioning = new IssueLabelProvisioningRepository(
        createIssueLabelProvisioningClient(),
    );

    const repositoryConfiguration = new RepositoryVariablesRepository(createRepositoryVariablesClient());
    return composeInitialSetupUseCase(
        new AuthenticatedUserRepository(createAuthenticatedUserClient()),
        labelProvisioning,
        new IssueTypeRepository(createGraphqlTransportClient()),
        new GitCliRepository(),
        new RepositoryDefaultBranchRepository(createReleaseClient()),
        new RepositoryTagRepository(createReleaseClient()),
        new SetupWorkspaceAdapter(),
        repositoryConfiguration,
        repositoryConfiguration,
    );
}
