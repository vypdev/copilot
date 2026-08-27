import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import type { IssueDescriptionQueryPort } from "../../../../application/ports/issue_description_ports";
import { extractVersion } from "../../../../utils/content_utils";
import { logDebugInfo, logError, logInfo } from "../../../../utils/logger";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class GetReleaseVersionUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'GetReleaseVersionUseCase';
    
    constructor(private readonly issueRepository: IssueDescriptionQueryPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];

        try {
            let number = -1
            if (param.isSingleAction) {
                number = param.singleAction.issue
            } else if (param.isIssue) {
                number = param.issue.number
            } else if (param.isPullRequest) {
                number = param.pullRequest.number
            } else {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the version but there was a problem identifying the issue.`],
                    })
                );
                return result;
            }

            const description = await this.issueRepository.getDescription(
                param.owner,
                param.repo,
                number,
                param.tokens.token,
            )

            if (description === undefined) {
                logDebugInfo(`GetReleaseVersion: no description for issue/PR ${number}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        steps: [`Tried to get the version but there was a problem getting the description.`],
                    })
                );
                return result;
            }

            const releaseVersion = extractVersion('Release Version', description)

            if (releaseVersion === undefined) {
                logDebugInfo(`GetReleaseVersion: no "Release Version" found in description (issue/PR ${number}).`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                    })
                );
                return result;
            }

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    payload: {
                        releaseVersion: releaseVersion,
                    }
                })
            );
        } catch (error) {
            logError(`GetReleaseVersion: failed to get version for issue/PR.`, error instanceof Error ? { stack: (error as Error).stack } : undefined);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Tried to get the release version but there was a problem.`],
                    error: error,
                })
            );
        }

        return result;
    }
}
