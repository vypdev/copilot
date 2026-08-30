import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { EventualConsistencyDelayPort } from '../../../ports/eventual_consistency_ports';
import type { PullRequestIssueLinkPort } from '../../../ports/pull_request_issue_link_ports';

export async function runLinkPullRequestIssue(
    param: Execution,
    taskId: string,
    pullRequestIssueLinkPort: PullRequestIssueLinkPort,
    eventualConsistencyDelayPort: EventualConsistencyDelayPort,
): Promise<Result[]> {
    if (await pullRequestIssueLinkPort.isLinked(param.pullRequest.url)) return [];

    const results = await addTemporaryIssueReference(param, taskId, pullRequestIssueLinkPort);
    await eventualConsistencyDelayPort.wait(20_000);
    results.push(...await restorePullRequestState(param, taskId, pullRequestIssueLinkPort));
    return results;
}

async function addTemporaryIssueReference(
    param: Execution,
    taskId: string,
    port: PullRequestIssueLinkPort,
): Promise<Result[]> {
    await port.updateBaseBranch(
        param.owner,
        param.repo,
        param.pullRequest.number,
        param.branches.defaultBranch,
        param.tokens.token,
    );
    const results = [new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [`The base branch was temporarily updated to \`${param.branches.defaultBranch}\`.`],
    })];

    await port.updateDescription(
        param.owner,
        param.repo,
        param.pullRequest.number,
        `${param.pullRequest.body}\n\nResolves #${param.issueNumber}`,
        param.tokens.token,
    );
    results.push(new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [`The description was temporarily modified to include a reference to issue **#${param.issueNumber}**.`],
    }));
    return results;
}

async function restorePullRequestState(
    param: Execution,
    taskId: string,
    port: PullRequestIssueLinkPort,
): Promise<Result[]> {
    await port.updateBaseBranch(
        param.owner,
        param.repo,
        param.pullRequest.number,
        param.pullRequest.base,
        param.tokens.token,
    );
    const results = [new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [`The base branch was reverted to its original value: \`${param.pullRequest.base}\`.`],
    })];
    await port.updateDescription(
        param.owner,
        param.repo,
        param.pullRequest.number,
        param.pullRequest.body.replace(`\n\nResolves #${param.issueNumber}`, ''),
        param.tokens.token,
    );
    results.push(new Result({
        id: taskId,
        success: true,
        executed: true,
        steps: [`The temporary issue reference **#${param.issueNumber}** was removed from the description.`],
    }));
    return results;
}
