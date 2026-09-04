import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type { InitialLabelProvisioningPort, IssueTypeProvisioningPort } from '../../ports/issue_management_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
import type { SetupResourceProvisioningDependencies } from './setup_resource_provisioning';
import type { InitialSetupRequest } from './initial_setup_request';
export interface InitialSetupWorkflowDependencies extends SetupResourceProvisioningDependencies {
    authenticatedUserPort: AuthenticatedUserPort;
    initialLabelProvisioningPort: InitialLabelProvisioningPort;
    issueTypeProvisioningPort: IssueTypeProvisioningPort;
    latestTagQueryPort: LatestTagQueryPort;
    repositoryDefaultBranchPort: RepositoryDefaultBranchPort;
    repositoryTagPort: RepositoryTagPort;
    setupWorkspacePort: SetupWorkspacePort;
}
/** Runs repository setup as an ordered application workflow with explicit port dependencies. */
export declare function runInitialSetupWorkflow(request: InitialSetupRequest, dependencies: InitialSetupWorkflowDependencies): Promise<Result[]>;
