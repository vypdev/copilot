import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { PullRequestIssueLinkPort } from "../../../ports/pull_request_issue_link_ports";
import type { EventualConsistencyDelayPort } from "../../../ports/eventual_consistency_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class LinkPullRequestIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'LinkPullRequestIssueUseCase';
    
    constructor(
        private readonly pullRequestIssueLinkPort: PullRequestIssueLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []

        try {
            const isLinked = await this.pullRequestIssueLinkPort.isLinked(param.pullRequest.url);

            if (!isLinked) {
                /**
                 *  Set the primary/default branch
                 */
                await this.pullRequestIssueLinkPort.updateBaseBranch(
                    param.owner,
                    param.repo,
                    param.pullRequest.number,
                    param.branches.defaultBranch,
                    param.tokens.token,
                )

                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `The base branch was temporarily updated to \`${param.branches.defaultBranch}\`.`,
                        ],
                    })
                )

                /**
                 *  Update PR's description.
                 */
                let prBody = param.pullRequest.body;

                let updatedBody = `${prBody}\n\nResolves #${param.issueNumber}`;
                await this.pullRequestIssueLinkPort.updateDescription(
                    param.owner,
                    param.repo,
                    param.pullRequest.number,
                    updatedBody,
                    param.tokens.token,
                );

                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `The description was temporarily modified to include a reference to issue **#${param.issueNumber}**.`,
                        ],
                    })
                )

                /**
                 *  Await 20 seconds
                 */
                await this.eventualConsistencyDelayPort.wait(20_000);

                /**
                 *  Restore the original branch
                 */
                await this.pullRequestIssueLinkPort.updateBaseBranch(
                    param.owner,
                    param.repo,
                    param.pullRequest.number,
                    param.pullRequest.base,
                    param.tokens.token,
                )

                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `The base branch was reverted to its original value: \`${param.pullRequest.base}\`.`,
                        ],
                    })
                )

                /**
                 * Restore comment on description
                 */
                prBody = param.pullRequest.body;
                updatedBody = prBody.replace(`\n\nResolves #${param.issueNumber}`, "");
                await this.pullRequestIssueLinkPort.updateDescription(
                    param.owner,
                    param.repo,
                    param.pullRequest.number,
                    updatedBody,
                    param.tokens.token,
                );

                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [
                            `The temporary issue reference **#${param.issueNumber}** was removed from the description.`,
                        ],
                    })
                )

                return result;
            }
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to link pull request to project, but there was a problem.`,
                    ],
                    errors: [error],
                })
            )
        }
        return result;
    }
}
