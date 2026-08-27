import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueTitlePort } from "../../../../application/ports/issue_title_ports";
import { logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class UpdateTitleUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'UpdateTitleUseCase';
    
    constructor(private readonly issueRepository: IssueTitlePort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        try {
            if (param.isIssue) {
                if (param.emoji.emojiLabeledTitle) {
                    const _title = await this.issueRepository.getTitle(
                        param.owner,
                        param.repo,
                        param.issue.number,
                        param.tokens.token,
                    ) ?? param.issue.title;
                    let _version = ''
                    if (param.release.active) {
                        _version = param.release.version ?? '';
                    } else if (param.hotfix.active) {
                        _version = param.hotfix.version ?? '';
                    }

                    const title = await this.issueRepository.updateTitleIssueFormat(
                        param.owner,
                        param.repo,
                        _version,
                        _title,
                        param.issue.number,
                        param.issue.branchManagementAlways,
                        param.emoji.branchManagementEmoji,
                        param.labels,
                        param.tokens.token,
                    );
                    if (title) {
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: true,
                                steps: [
                                    `The issue's title was updated from \`${_title}\` to \`${title}\`.`,
                                ]
                            })
                        )
                    } else {
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: false,
                            })
                        )
                    }
                } else {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: false,
                        })
                    )
                }
            } else if (param.isPullRequest) {
                if (param.emoji.emojiLabeledTitle) {
                    const issueTitle = await this.issueRepository.getTitle(
                        param.owner,
                        param.repo,
                        param.issueNumber,
                        param.tokens.token,
                    )
                    if (issueTitle === undefined) {
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: false,
                                executed: true,
                                steps: [
                                    `Tried to update title, but there was a problem.`,
                                ],
                            })
                        )
                        return result
                    }
                    const title = await this.issueRepository.updateTitlePullRequestFormat(
                        param.owner,
                        param.repo,
                        param.pullRequest.title,
                        issueTitle,
                        param.issueNumber,
                        param.pullRequest.number,
                        false,
                        '',
                        param.labels,
                        param.tokens.token,
                    );
                    if (title) {
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: true,
                                steps: [
                                    `The pull request's title was updated from \`${param.pullRequest.title}\` to \`${title}\`.`,
                                ]
                            })
                        )
                    } else {
                        result.push(
                            new Result({
                                id: this.taskId,
                                success: true,
                                executed: false,
                            })
                        )
                    }
                } else {
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: false,
                        })
                    )
                }
            }
        } catch (error) {
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to update title, but there was a problem.`,
                    ],
                    error: error,
                })
            )
        }
        return result
    }
}