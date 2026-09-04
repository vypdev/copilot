import { INPUT_KEYS } from '../../contracts/input_keys';
import { parsePositiveSafeInteger } from '../../../domain/positive_integer_policy';
import { extractIssueNumberFromBranch, extractIssueNumberFromPush } from '../../../utils/title_utils';
import type { ExecutionIssueResolutionContext } from '../../ports/execution_resolution_ports';
import type { ExecutionIssueSetupPort } from '../../ports/execution_setup_ports';

type IssueRepository = Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>;

export function resolveEventIssueNumber(execution: ExecutionIssueResolutionContext): number | undefined {
    if (execution.isIssue) return positiveIssueNumberOrUndefined(execution.issue.number);
    if (execution.isPullRequest) {
        if (['check_suite', 'workflow_run'].includes(String(execution.inputs?.eventName ?? ''))) {
            return positiveIssueNumberOrUndefined(execution.pullRequest.number);
        }
        return positiveIssueNumberOrUndefined(extractIssueNumberFromBranch(execution.pullRequest.head))
            ?? positiveIssueNumberOrUndefined(execution.pullRequest.number);
    }
    if (execution.isPush) return positiveIssueNumberOrUndefined(extractIssueNumberFromPush(execution.commit.branch));
    return positiveIssueNumberOrUndefined(execution.issueNumber);
}

export async function resolveSingleActionIssueNumber(
    execution: ExecutionIssueResolutionContext,
    issueRepository: IssueRepository,
): Promise<number | undefined> {
    const configuredIssue = execution.inputs?.[INPUT_KEYS.SINGLE_ACTION_ISSUE];
    if (configuredIssue !== undefined && configuredIssue !== null && String(configuredIssue).trim() !== '') {
        const issueNumber = parsePositiveSafeInteger(configuredIssue);
        return issueNumber === undefined ? undefined : setIssueNumber(execution, issueNumber);
    }
    if (execution.isIssue) {
        const issueNumber = positiveIssueNumberOrUndefined(execution.issue.number);
        return issueNumber === undefined ? undefined : setIssueNumber(execution, issueNumber, 'issue');
    }
    if (execution.isPullRequest) return setResolvedIssueNumber(
        execution,
        extractIssueNumberFromBranch(execution.pullRequest.head),
        'pullRequest',
    );
    if (execution.isPush) return setResolvedIssueNumber(
        execution,
        extractIssueNumberFromPush(execution.commit.branch),
        'push',
    );
    // SingleAction uses zero as its explicit domain value for actions that do
    // not need an issue. Do not query GitHub with that sentinel.
    if (execution.singleAction.issue === 0) return undefined;
    return resolveConfiguredSingleAction(execution, issueRepository);
}

async function resolveConfiguredSingleAction(
    execution: ExecutionIssueResolutionContext,
    issueRepository: IssueRepository,
): Promise<number | undefined> {
    const issueNumber = execution.singleAction.issue;
    if (!positiveIssueNumberOrUndefined(issueNumber)) return undefined;
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
    if (!isPullRequest) return undefined;

    const head = await issueRepository.getHeadBranch(
        execution.owner,
        execution.repo,
        issueNumber,
        execution.tokens.token,
    );
    return head === undefined
        ? undefined
        : setResolvedIssueNumber(execution, extractIssueNumberFromBranch(head));
}

function setResolvedIssueNumber(
    execution: ExecutionIssueResolutionContext,
    issueNumber: number,
    actionType?: 'issue' | 'pullRequest' | 'push',
): number | undefined {
    const resolvedIssueNumber = positiveIssueNumberOrUndefined(issueNumber);
    return resolvedIssueNumber === undefined
        ? undefined
        : setIssueNumber(execution, resolvedIssueNumber, actionType);
}

function positiveIssueNumberOrUndefined(value: unknown): number | undefined {
    return parsePositiveSafeInteger(value);
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
