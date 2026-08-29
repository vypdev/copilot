import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type { InitialLabelProvisioningPort, IssueTypeProvisioningPort } from '../../ports/issue_management_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
import { ParamUseCase } from '../base/param_usecase';
import { runInitialSetupWorkflow } from './initial_setup_workflow';

/** Application boundary for provisioning a repository for Copilot automation. */
export class InitialSetupUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'InitialSetupUseCase';

    constructor(
        private readonly authenticatedUserPort: AuthenticatedUserPort,
        private readonly initialLabelProvisioningPort: InitialLabelProvisioningPort,
        private readonly issueTypeProvisioningPort: IssueTypeProvisioningPort,
        private readonly latestTagQueryPort: LatestTagQueryPort,
        private readonly repositoryDefaultBranchPort: RepositoryDefaultBranchPort,
        private readonly repositoryTagPort: RepositoryTagPort,
        private readonly setupWorkspacePort: SetupWorkspacePort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runInitialSetupWorkflow(param, {
            authenticatedUserPort: this.authenticatedUserPort,
            initialLabelProvisioningPort: this.initialLabelProvisioningPort,
            issueTypeProvisioningPort: this.issueTypeProvisioningPort,
            latestTagQueryPort: this.latestTagQueryPort,
            repositoryDefaultBranchPort: this.repositoryDefaultBranchPort,
            repositoryTagPort: this.repositoryTagPort,
            setupWorkspacePort: this.setupWorkspacePort,
        });
    }
}
