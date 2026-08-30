import type { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { PullRequestIssueLinkPort } from "../../../ports/pull_request_issue_link_ports";
import type { EventualConsistencyDelayPort } from "../../../ports/eventual_consistency_ports";
import { logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runLinkPullRequestIssue } from './link_pull_request_issue_workflow';

export class LinkPullRequestIssueUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'LinkPullRequestIssueUseCase';
    
    constructor(
        private readonly pullRequestIssueLinkPort: PullRequestIssueLinkPort,
        private readonly eventualConsistencyDelayPort: EventualConsistencyDelayPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        try {
            return await runLinkPullRequestIssue(
                param,
                this.taskId,
                this.pullRequestIssueLinkPort,
                this.eventualConsistencyDelayPort,
            );
        } catch (error) {
            logError(error);
            return [
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to link pull request to project, but there was a problem.`,
                    ],
                    errors: [error],
                }),
            ];
        }
    }
}
