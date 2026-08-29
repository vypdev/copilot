import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { RepositoryTagPort } from "../../ports/repository_release_ports";
import { INPUT_KEYS } from "../../../utils/constants";
import { logError, logInfo, logWarn } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";


export class CreateTagUseCase  implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CreateTagUseCase';
    
    constructor(private readonly repositoryReleasePort: RepositoryTagPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const result: Result[] = [];

        if (param.singleAction.version.length === 0) {
            logError(`Version is not set.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [
                        `${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`
                    ],
                })
            );
            return result;
        } else if (param.currentConfiguration.releaseBranch === undefined) {
            logError(`Working branch not found in configuration.`)
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [
                        `Release branch not found in issue configuration.`
                    ],
                })
            );
            return result;
        }

        const tagName = `v${param.singleAction.version}`;

        try {
            const sha1Tag = await this.repositoryReleasePort.createTag(
                param.owner,
                param.repo,
                param.currentConfiguration.releaseBranch,
                tagName,
                param.tokens.token,
            );
            if (sha1Tag) {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [`Tag ${tagName} is ready: ${sha1Tag}`],
                    })
                );
            } else {
                logWarn(`CreateTag: createTag returned no SHA for version ${tagName}.`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: [
                            `Failed to create tag ${tagName}.`
                        ],
                    })
                );
            }
        } catch (error) {
            logError(`Error executing ${this.taskId}: ${error}`);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [`Failed to create tag ${tagName}.`],
                    errors: [error],
                })
            );
        }
        return result;
    }
}
