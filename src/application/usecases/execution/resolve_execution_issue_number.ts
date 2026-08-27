import { INPUT_KEYS } from '../../../utils/constants';
import { extractIssueNumberFromBranch, extractIssueNumberFromPush } from '../../../utils/title_utils';
import type { ExecutionIssueResolutionContext } from '../../ports/execution_resolution_ports';
import type { ExecutionIssueSetupPort } from '../../ports/execution_setup_ports';

export async function resolveExecutionIssueNumber(
    execution: ExecutionIssueResolutionContext,
    issueRepository: Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>,
): Promise<number | undefined> {
    if (execution.isSingleAction) {
        if (execution.inputs?.[INPUT_KEYS.SINGLE_ACTION_ISSUE]) {
            execution.issueNumber = Number(execution.inputs[INPUT_KEYS.SINGLE_ACTION_ISSUE]);
            execution.singleAction.issue = execution.issueNumber;
        } else if (execution.isIssue) {
            execution.singleAction.isIssue = true;
            execution.issueNumber = execution.issue.number;
            execution.singleAction.issue = execution.issueNumber;
        } else if (execution.isPullRequest) {
            execution.singleAction.isPullRequest = true;
            execution.issueNumber = extractIssueNumberFromBranch(execution.pullRequest.head);
            execution.singleAction.issue = execution.issueNumber;
        } else if (execution.isPush) {
            execution.singleAction.isPush = true;
            execution.issueNumber = extractIssueNumberFromPush(execution.commit.branch);
            execution.singleAction.issue = execution.issueNumber;
        } else {
            execution.singleAction.isPullRequest = await issueRepository.isPullRequest(
                execution.owner,
                execution.repo,
                execution.singleAction.issue,
                execution.tokens.token,
            );
            execution.singleAction.isIssue = await issueRepository.isIssue(
                execution.owner,
                execution.repo,
                execution.singleAction.issue,
                execution.tokens.token,
            );
            if (execution.singleAction.isIssue) {
                execution.issueNumber = execution.singleAction.issue;
            } else if (execution.singleAction.isPullRequest) {
                const head = await issueRepository.getHeadBranch(
                    execution.owner,
                    execution.repo,
                    execution.singleAction.issue,
                    execution.tokens.token,
                );
                if (head === undefined) return undefined;
                execution.issueNumber = extractIssueNumberFromBranch(head);
            }
        }
    } else if (execution.isIssue) {
        execution.issueNumber = execution.issue.number;
    } else if (execution.isPullRequest) {
        execution.issueNumber = extractIssueNumberFromBranch(execution.pullRequest.head);
    } else if (execution.isPush) {
        execution.issueNumber = extractIssueNumberFromPush(execution.commit.branch);
    }
    return execution.issueNumber;
}
