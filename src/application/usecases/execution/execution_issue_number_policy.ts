import { parsePositiveSafeInteger } from '../../../domain/positive_integer_policy';
import { extractIssueNumberFromBranch, extractIssueNumberFromPush } from '../../../utils/title_utils';
import type { SetupIssueQueryPort } from '../../ports/setup_execution_ports';
import type {
    ExecutionIssueResolution,
    SetupExecutionContext,
} from './setup_execution_contracts';

type IssueRepository = Pick<SetupIssueQueryPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>;

export function resolveEventIssueNumber(context: SetupExecutionContext): ExecutionIssueResolution {
    let issueNumber: number | undefined;
    if (context.isIssue) issueNumber = positiveIssueNumberOrUndefined(context.issue.number);
    else if (context.isPullRequest) {
        if (['check_suite', 'workflow_run'].includes(context.eventName)) {
            issueNumber = positiveIssueNumberOrUndefined(context.pullRequest.number);
        } else {
            issueNumber = positiveIssueNumberOrUndefined(extractIssueNumberFromBranch(context.pullRequest.head))
                ?? positiveIssueNumberOrUndefined(context.pullRequest.number);
        }
    } else if (context.isPush) issueNumber = positiveIssueNumberOrUndefined(extractIssueNumberFromPush(context.commit.branch));
    else issueNumber = positiveIssueNumberOrUndefined(context.issueNumber);
    return { issueNumber, singleAction: currentSingleAction(context) };
}

export async function resolveSingleActionIssueNumber(
    context: SetupExecutionContext,
    issueRepository: IssueRepository,
): Promise<ExecutionIssueResolution> {
    const configuredIssue = context.configuredSingleActionIssue;
    if (configuredIssue !== undefined && String(configuredIssue).trim() !== '') {
        const issueNumber = parsePositiveSafeInteger(configuredIssue);
        return resolution(context, issueNumber);
    }
    if (context.isIssue) {
        return resolution(context, positiveIssueNumberOrUndefined(context.issue.number), 'issue');
    }
    if (context.isPullRequest) return resolution(
        context,
        positiveIssueNumberOrUndefined(extractIssueNumberFromBranch(context.pullRequest.head)),
        'pullRequest',
    );
    if (context.isPush) return resolution(
        context,
        positiveIssueNumberOrUndefined(extractIssueNumberFromPush(context.commit.branch)),
        'push',
    );
    // SingleAction uses zero as its explicit domain value for actions that do
    // not need an issue. Do not query GitHub with that sentinel.
    if (context.singleAction.issue === 0) return resolution(context, undefined);
    return resolveConfiguredSingleAction(context, issueRepository);
}

async function resolveConfiguredSingleAction(
    context: SetupExecutionContext,
    issueRepository: IssueRepository,
): Promise<ExecutionIssueResolution> {
    const issueNumber = positiveIssueNumberOrUndefined(context.singleAction.issue);
    if (issueNumber === undefined) return resolution(context, undefined);
    const isPullRequest = await issueRepository.isPullRequest(issueNumber);
    const isIssue = await issueRepository.isIssue(issueNumber);
    const singleAction = { ...currentSingleAction(context), isPullRequest, isIssue };
    if (isIssue) return { issueNumber, singleAction: { ...singleAction, issue: issueNumber } };
    if (!isPullRequest) return { issueNumber: undefined, singleAction };

    const head = await issueRepository.getHeadBranch(issueNumber);
    const resolvedIssueNumber = head === undefined
        ? undefined
        : positiveIssueNumberOrUndefined(extractIssueNumberFromBranch(head));
    return {
        issueNumber: resolvedIssueNumber,
        singleAction: resolvedIssueNumber === undefined
            ? singleAction
            : { ...singleAction, issue: resolvedIssueNumber },
    };
}

function resolution(
    context: SetupExecutionContext,
    issueNumber: number | undefined,
    actionType?: 'issue' | 'pullRequest' | 'push',
): ExecutionIssueResolution {
    const singleAction = currentSingleAction(context);
    if (actionType === 'issue') singleAction.isIssue = true;
    if (actionType === 'pullRequest') singleAction.isPullRequest = true;
    if (actionType === 'push') singleAction.isPush = true;
    return {
        issueNumber,
        singleAction: issueNumber === undefined ? singleAction : { ...singleAction, issue: issueNumber },
    };
}

function positiveIssueNumberOrUndefined(value: unknown): number | undefined {
    return parsePositiveSafeInteger(value);
}

function currentSingleAction(context: SetupExecutionContext): {
    issue: number;
    isIssue: boolean;
    isPullRequest: boolean;
    isPush: boolean;
} {
    return {
        issue: context.singleAction.issue,
        isIssue: context.singleAction.isIssue,
        isPullRequest: context.singleAction.isPullRequest,
        isPush: context.singleAction.isPush,
    };
}
