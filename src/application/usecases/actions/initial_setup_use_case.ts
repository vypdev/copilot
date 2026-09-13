import { Result } from '../../../data/model/result';
import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { BoundAuthenticatedUserPort } from '../../ports/authenticated_user_ports';
import type { BoundRepositoryTagPort, BoundRepositoryDefaultBranchPort } from '../../ports/repository_release_ports';
import type { BoundInitialLabelProvisioningPort, BoundIssueTypeProvisioningPort } from '../../ports/issue_management_ports';
import type { BoundSetupWorkspacePort } from '../../ports/setup_workspace_ports';
import { ParamUseCase } from '../base/param_usecase';
import { runInitialSetupWorkflow } from './initial_setup_workflow';
import type { InitialSetupContext } from '../push_single_action_contexts';
import type {
    BoundSetupRemoteConfigurationReadPort,
    BoundSetupRepositorySecretsCommandPort,
    BoundSetupRepositoryVariablesCommandPort,
} from '../../ports/setup_wizard_ports';

/** Application boundary for provisioning a repository for Copilot automation. */
export class InitialSetupUseCase implements ParamUseCase<InitialSetupContext, Result[]> {
    taskId = 'InitialSetupUseCase';

    constructor(
        private readonly authenticatedUserPort: BoundAuthenticatedUserPort,
        private readonly initialLabelProvisioningPort: BoundInitialLabelProvisioningPort,
        private readonly issueTypeProvisioningPort: BoundIssueTypeProvisioningPort,
        private readonly latestTagQueryPort: LatestTagQueryPort,
        private readonly repositoryDefaultBranchPort: BoundRepositoryDefaultBranchPort,
        private readonly repositoryTagPort: BoundRepositoryTagPort,
        private readonly setupWorkspacePort: BoundSetupWorkspacePort,
        private readonly setupRepositoryVariablesPort?: BoundSetupRepositoryVariablesCommandPort,
        private readonly setupRepositorySecretsPort?: BoundSetupRepositorySecretsCommandPort,
        private readonly setupRemoteConfigurationReadPort?: BoundSetupRemoteConfigurationReadPort,
    ) {}

    async invoke(param: InitialSetupContext): Promise<Result[]> {
        return await runInitialSetupWorkflow(param, {
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
