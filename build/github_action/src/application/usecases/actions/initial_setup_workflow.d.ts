import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type { InitialLabelProvisioningPort, IssueTypeProvisioningPort } from '../../ports/issue_management_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
import type { SetupRepositorySecretsPort, SetupRepositoryVariablesPort } from '../../ports/setup_wizard_ports';
export interface InitialSetupWorkflowDependencies {
    authenticatedUserPort: AuthenticatedUserPort;
    initialLabelProvisioningPort: InitialLabelProvisioningPort;
    issueTypeProvisioningPort: IssueTypeProvisioningPort;
    latestTagQueryPort: LatestTagQueryPort;
    repositoryDefaultBranchPort: RepositoryDefaultBranchPort;
    repositoryTagPort: RepositoryTagPort;
    setupWorkspacePort: SetupWorkspacePort;
    setupRepositoryVariablesPort?: SetupRepositoryVariablesPort;
    setupRepositorySecretsPort?: SetupRepositorySecretsPort;
}
/** Runs repository setup as an ordered application workflow with explicit port dependencies. */
export declare function runInitialSetupWorkflow(param: Execution, dependencies: InitialSetupWorkflowDependencies): Promise<Result[]>;
