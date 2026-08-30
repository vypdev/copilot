import { INPUT_KEYS } from '../../../utils/constants';
import { extractIssueNumberFromBranch, extractIssueNumberFromPush } from '../../../utils/title_utils';
import type { ExecutionIssueResolutionContext } from '../../ports/execution_resolution_ports';
import type { ExecutionIssueSetupPort } from '../../ports/execution_setup_ports';

type IssueRepository = Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>;

export function resolveEventIssueNumber(execution: ExecutionIssueResolutionContext): number | undefined {
    if (execution.isIssue) return execution.issue.number;
    if (execution.isPullRequest) return extractIssueNumberFromBranch(execution.pullRequest.head);
    if (execution.isPush) return extractIssueNumberFromPush(execution.commit.branch);
    return execution.issueNumber;
}

export async function resolveSingleActionIssueNumber(
    execution: ExecutionIssueResolutionContext,
    issueRepository: IssueRepository,
): Promise<number | undefined> {
    const configuredIssue = execution.inputs?.[INPUT_KEYS.SINGLE_ACTION_ISSUE];
    if (configuredIssue) return setIssueNumber(execution, Number(configuredIssue));
    if (execution.isIssue) return setIssueNumber(execution, execution.issue.number, 'issue');
    if (execution.isPullRequest) return setIssueNumber(
        execution,
        extractIssueNumberFromBranch(execution.pullRequest.head),
        'pullRequest',
    );
    if (execution.isPush) return setIssueNumber(
        execution,
        extractIssueNumberFromPush(execution.commit.branch),
        'push',
    );
    return resolveConfiguredSingleAction(execution, issueRepository);
}

async function resolveConfiguredSingleAction(
    execution: ExecutionIssueResolutionContext,
    issueRepository: IssueRepository,
): Promise<number | undefined> {
    const issueNumber = execution.singleAction.issue;
    const isPullRequest = await issueRepository.isPullRequest(
        execution.owner,
        execution.repo,
        issueNumber,
        execution.tokens.token,
    );
    const isIssue = await issueRepository.isIssue(
        execution.owner,
        execution.repo,
        issueNumber,
        execution.tokens.token,
    );
    execution.singleAction.isPullRequest = isPullRequest;
    execution.singleAction.isIssue = isIssue;
    if (isIssue) return setIssueNumber(execution, issueNumber);
    if (!isPullRequest) return execution.issueNumber;

    const head = await issueRepository.getHeadBranch(
        execution.owner,
        execution.repo,
        issueNumber,
        execution.tokens.token,
    );
    return head === undefined ? undefined : setIssueNumber(execution, extractIssueNumberFromBranch(head));
}

function setIssueNumber(
    execution: ExecutionIssueResolutionContext,
    issueNumber: number,
    actionType?: 'issue' | 'pullRequest' | 'push',
): number {
    if (actionType === 'issue') execution.singleAction.isIssue = true;
    if (actionType === 'pullRequest') execution.singleAction.isPullRequest = true;
    if (actionType === 'push') execution.singleAction.isPush = true;
    execution.issueNumber = issueNumber;
    execution.singleAction.issue = issueNumber;
    return issueNumber;
}
