import type { ExecutionConfigurationPort } from '../../ports/execution_configuration_ports';
import type { ExecutionIssueSetupPort, ExecutionOrganizationSetupPort } from '../../ports/execution_setup_ports';
import type { Execution } from '../../../data/model/execution';
import type { ParamUseCase } from '../base/param_usecase';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
import { runSetupExecution } from './setup_execution_workflow';

export class SetupExecutionUseCase implements ParamUseCase<Execution, void> {
    taskId = 'SetupExecutionUseCase';

    constructor(
        private readonly issueSetupPort: ExecutionIssueSetupPort,
        private readonly organizationSetupPort: ExecutionOrganizationSetupPort,
        private readonly configurationPort: ExecutionConfigurationPort,
        private readonly branchVersionResolver: ExecutionBranchVersionResolution,
    ) {}

    invoke(execution: Execution): Promise<void> {
        return runSetupExecution(execution, {
            issueSetupPort: this.issueSetupPort,
            organizationSetupPort: this.organizationSetupPort,
            configurationPort: this.configurationPort,
            branchVersionResolver: this.branchVersionResolver,
        });
    }
}
