import type {
    SetupConfigurationQueryPort,
    SetupIssueQueryPort,
    SetupOrganizationQueryPort,
} from '../../ports/setup_execution_ports';
import type { ParamUseCase } from '../base/param_usecase';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
import { runSetupExecution } from './setup_execution_workflow';
import type { SetupExecutionContext, SetupExecutionResult } from './setup_execution_contracts';

export class SetupExecutionUseCase implements ParamUseCase<SetupExecutionContext, SetupExecutionResult> {
    taskId = 'SetupExecutionUseCase';

    constructor(
        private readonly issueSetupPort: SetupIssueQueryPort,
        private readonly organizationSetupPort: SetupOrganizationQueryPort,
        private readonly configurationPort: SetupConfigurationQueryPort,
        private readonly branchVersionResolver: ExecutionBranchVersionResolution,
    ) {}

    invoke(context: SetupExecutionContext): Promise<SetupExecutionResult> {
        return runSetupExecution(context, {
            issueSetupPort: this.issueSetupPort,
            organizationSetupPort: this.organizationSetupPort,
            configurationPort: this.configurationPort,
            branchVersionResolver: this.branchVersionResolver,
        });
    }
}
