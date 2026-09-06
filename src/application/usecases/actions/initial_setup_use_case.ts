import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { AuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { RepositoryTagPort, RepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type { InitialLabelProvisioningPort, IssueTypeProvisioningPort } from '../../ports/issue_management_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';
import { ParamUseCase } from '../base/param_usecase';
import { runInitialSetupWorkflow } from './initial_setup_workflow';
import { createInitialSetupRequest } from './initial_setup_request';
import type {
    SetupRemoteConfigurationReadPort,
    SetupRepositorySecretsPort,
    SetupRepositoryVariablesPort,
} from '../../ports/setup_wizard_ports';

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
        private readonly setupRepositoryVariablesPort?: SetupRepositoryVariablesPort,
        private readonly setupRepositorySecretsPort?: SetupRepositorySecretsPort,
        private readonly setupRemoteConfigurationReadPort?: SetupRemoteConfigurationReadPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runInitialSetupWorkflow(createInitialSetupRequest(param), {
            authenticatedUserPort: this.authenticatedUserPort,
            initialLabelProvisioningPort: this.initialLabelProvisioningPort,
            issueTypeProvisioningPort: this.issueTypeProvisioningPort,
            latestTagQueryPort: this.latestTagQueryPort,
            repositoryDefaultBranchPort: this.repositoryDefaultBranchPort,
            repositoryTagPort: this.repositoryTagPort,
            setupWorkspacePort: this.setupWorkspacePort,
            setupRepositoryVariablesPort: this.setupRepositoryVariablesPort,
            setupRepositorySecretsPort: this.setupRepositorySecretsPort,
            setupRemoteConfigurationReadPort: this.setupRemoteConfigurationReadPort,
        });
    }
}
