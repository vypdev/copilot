import type { ExecutionIssueResolutionContext } from '../../ports/execution_resolution_ports';
import type { ExecutionIssueSetupPort } from '../../ports/execution_setup_ports';
export declare function resolveExecutionIssueNumber(execution: ExecutionIssueResolutionContext, issueRepository: Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>): Promise<number | undefined>;
