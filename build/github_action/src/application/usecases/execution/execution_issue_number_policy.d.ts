import type { ExecutionIssueResolutionContext } from '../../ports/execution_resolution_ports';
import type { ExecutionIssueSetupPort } from '../../ports/execution_setup_ports';
type IssueRepository = Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>;
export declare function resolveEventIssueNumber(execution: ExecutionIssueResolutionContext): number | undefined;
export declare function resolveSingleActionIssueNumber(execution: ExecutionIssueResolutionContext, issueRepository: IssueRepository): Promise<number | undefined>;
export {};
