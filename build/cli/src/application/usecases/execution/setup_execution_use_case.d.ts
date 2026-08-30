import type { ExecutionConfigurationPort } from '../../ports/execution_configuration_ports';
import type { ExecutionIssueSetupPort, ExecutionOrganizationSetupPort } from '../../ports/execution_setup_ports';
import type { Execution } from '../../../data/model/execution';
import type { ParamUseCase } from '../base/param_usecase';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
export declare class SetupExecutionUseCase implements ParamUseCase<Execution, void> {
    private readonly issueSetupPort;
    private readonly organizationSetupPort;
    private readonly configurationPort;
    private readonly branchVersionResolver;
    taskId: string;
    constructor(issueSetupPort: ExecutionIssueSetupPort, organizationSetupPort: ExecutionOrganizationSetupPort, configurationPort: ExecutionConfigurationPort, branchVersionResolver: ExecutionBranchVersionResolution);
    invoke(execution: Execution): Promise<void>;
}
