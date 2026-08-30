import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueTitlePort } from '../../../../application/ports/issue_title_ports';

export async function runIssueTitleUpdate(param: Execution, taskId: string, issueRepository: IssueTitlePort): Promise<Result[]> {
    if (!param.emoji.emojiLabeledTitle) return [skippedResult(taskId)];
    const currentTitle = await issueRepository.getTitle(param.owner, param.repo, param.issue.number, param.tokens.token) ?? param.issue.title;
    const version = param.release.active ? param.release.version ?? '' : param.hotfix.active ? param.hotfix.version ?? '' : '';
    const title = await issueRepository.updateTitleIssueFormat(
        param.owner, param.repo, version, currentTitle, param.issue.number,
        param.issue.branchManagementAlways, param.emoji.branchManagementEmoji, param.labels, param.tokens.token,
    );
    return title
        ? [updatedResult(taskId, `The issue's title was updated from \`${currentTitle}\` to \`${title}\`.`)]
        : [skippedResult(taskId)];
}

export async function runPullRequestTitleUpdate(param: Execution, taskId: string, issueRepository: IssueTitlePort): Promise<Result[]> {
    if (!param.emoji.emojiLabeledTitle) return [skippedResult(taskId)];
    const issueTitle = await issueRepository.getTitle(param.owner, param.repo, param.issueNumber, param.tokens.token);
    if (issueTitle === undefined) {
        return [new Result({ id: taskId, success: false, executed: true, steps: ['Tried to update title, but there was a problem.'] })];
    }
    const title = await issueRepository.updateTitlePullRequestFormat(
        param.owner, param.repo, param.pullRequest.title, issueTitle, param.issueNumber, param.pullRequest.number,
        false, '', param.labels, param.tokens.token,
    );
    return title
        ? [updatedResult(taskId, `The pull request's title was updated from \`${param.pullRequest.title}\` to \`${title}\`.`)]
        : [skippedResult(taskId)];
}

export function titleUpdateFailure(taskId: string, error: unknown): Result {
    return new Result({ id: taskId, success: false, executed: true, steps: ['Tried to update title, but there was a problem.'], errors: [error] });
}

function updatedResult(taskId: string, step: string): Result {
    return new Result({ id: taskId, success: true, executed: true, steps: [step] });
}

function skippedResult(taskId: string): Result {
    return new Result({ id: taskId, success: true, executed: false });
}
