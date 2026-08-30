import type { ExecutionIssueResolutionContext } from '../../ports/execution_resolution_ports';
import type { ExecutionIssueSetupPort } from '../../ports/execution_setup_ports';
import { resolveEventIssueNumber, resolveSingleActionIssueNumber } from './execution_issue_number_policy';

export async function resolveExecutionIssueNumber(
    execution: ExecutionIssueResolutionContext,
    issueRepository: Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>,
): Promise<number | undefined> {
    const resolvedIssueNumber = execution.isSingleAction
        ? await resolveSingleActionIssueNumber(execution, issueRepository)
        : resolveEventIssueNumber(execution);
    if (resolvedIssueNumber !== undefined) execution.issueNumber = resolvedIssueNumber;
    return resolvedIssueNumber;
}
