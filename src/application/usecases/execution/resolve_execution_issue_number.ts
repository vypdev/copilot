import type { SetupIssueQueryPort } from '../../ports/setup_execution_ports';
import type { ExecutionIssueResolution, SetupExecutionContext } from './setup_execution_contracts';
import { resolveEventIssueNumber, resolveSingleActionIssueNumber } from './execution_issue_number_policy';

export async function resolveExecutionIssueNumber(
    context: SetupExecutionContext,
    issueRepository: Pick<SetupIssueQueryPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>,
): Promise<ExecutionIssueResolution> {
    if (!context.isSingleAction && context.isPullRequest
        && ['issue_comment', 'pull_request_review_comment'].includes(context.eventName)
        && !context.pullRequest.head) {
        const head = await issueRepository.getHeadBranch(context.pullRequest.number);
        const resolved = resolveEventIssueNumber({
            ...context,
            eventName: 'pull_request',
            pullRequest: { ...context.pullRequest, head: head ?? '' },
        });
        return { ...resolved, ...(head ? { pullRequestHeadBranch: head } : {}) };
    }
    return context.isSingleAction
        ? resolveSingleActionIssueNumber(context, issueRepository)
        : resolveEventIssueNumber(context);
}
