import type { Execution } from '../../../data/model/execution';

export function resolveReadContentNumber(execution: Execution): number | undefined {
    if (execution.isSingleAction || execution.isPush) return execution.issueNumber;
    if (execution.isIssue) return execution.issue.number;
    if (execution.isPullRequest) return execution.pullRequest.number;
    return undefined;
}

export function resolveWriteContentNumber(execution: Execution): number | undefined {
    if (execution.isSingleAction) {
        if (execution.isIssue) return execution.issue.number;
        if (execution.isPullRequest) return execution.pullRequest.number;
        if (execution.isPush) return execution.issueNumber;
        return execution.singleAction.issue;
    }
    return resolveReadContentNumber(execution);
}
