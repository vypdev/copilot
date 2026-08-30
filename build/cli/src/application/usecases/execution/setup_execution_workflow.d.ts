import type { ExecutionConfigurationPort } from '../../ports/execution_configuration_ports';
import type { ExecutionIssueSetupPort, ExecutionOrganizationSetupPort } from '../../ports/execution_setup_ports';
import type { Execution } from '../../../data/model/execution';
import type { ExecutionBranchVersionResolution } from './execution_branch_version_resolver';
export interface SetupExecutionDependencies {
    issueSetupPort: ExecutionIssueSetupPort;
    organizationSetupPort: ExecutionOrganizationSetupPort;
    configurationPort: ExecutionConfigurationPort;
    branchVersionResolver: ExecutionBranchVersionResolution;
}
export declare function runSetupExecution(execution: Execution, dependencies: SetupExecutionDependencies): Promise<void>;
