import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type { InitialLabelProvisioningPort, IssueTypeProvisioningPort } from '../../ports/issue_management_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
import { ParamUseCase } from '../base/param_usecase';
/** Application boundary for provisioning a repository for Copilot automation. */
export declare class InitialSetupUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly authenticatedUserPort;
    private readonly initialLabelProvisioningPort;
    private readonly issueTypeProvisioningPort;
    private readonly latestTagQueryPort;
    private readonly repositoryDefaultBranchPort;
    private readonly repositoryTagPort;
    private readonly setupWorkspacePort;
    taskId: string;
    constructor(authenticatedUserPort: AuthenticatedUserPort, initialLabelProvisioningPort: InitialLabelProvisioningPort, issueTypeProvisioningPort: IssueTypeProvisioningPort, latestTagQueryPort: LatestTagQueryPort, repositoryDefaultBranchPort: RepositoryDefaultBranchPort, repositoryTagPort: RepositoryTagPort, setupWorkspacePort: SetupWorkspacePort);
    invoke(param: Execution): Promise<Result[]>;
}
