import type { SetupIssueQueryPort } from '../../ports/setup_execution_ports';
import type { ExecutionIssueResolution, SetupExecutionContext } from './setup_execution_contracts';
import { resolveEventIssueNumber, resolveSingleActionIssueNumber } from './execution_issue_number_policy';

export async function resolveExecutionIssueNumber(
    context: SetupExecutionContext,
    issueRepository: Pick<SetupIssueQueryPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>,
): Promise<ExecutionIssueResolution> {
    return context.isSingleAction
        ? resolveSingleActionIssueNumber(context, issueRepository)
        : resolveEventIssueNumber(context);
}
