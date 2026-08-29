import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

export class DeployedAddedUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'DeployedAddedUseCase';

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []
        try {
            if (param.issue.labeled && param.issue.labelAdded === param.labels.deployed) {
                logDebugInfo(`Deploy complete.`)
                if (param.release.active && param.release.branch !== undefined) {
                    const releaseUrl = `https://github.com/${param.owner}/${param.repo}/tree/${param.release.branch}`;
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `Deploy complete from [${param.release.branch}](${releaseUrl})`
                            ]
                        })
                    )
                } else if (param.hotfix.active && param.hotfix.branch !== undefined) {
                    const hotfixUrl = `https://github.com/${param.owner}/${param.repo}/tree/${param.hotfix.branch}`;
                    result.push(
                        new Result({
                            id: this.taskId,
                            success: true,
                            executed: true,
                            steps: [
                                `Deploy complete from [${param.hotfix.branch}](${hotfixUrl})`
                            ]
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
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Tried to complete the deployment, but there was a problem.`,
                    ],
                    errors: [
                        error?.toString() ?? 'Unknown error',
                    ],
                })
            )
        }
        return result
    }
}
