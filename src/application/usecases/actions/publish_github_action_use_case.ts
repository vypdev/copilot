import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { RepositoryTagPort, RepositoryReleasePublicationPort } from "../../ports/repository_release_ports";
import { INPUT_KEYS } from "../../../utils/constants";
import { logError, logInfo } from "../../../utils/logger";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";


export class PublishGithubActionUseCase  implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'PublishGithubActionUseCase';
    
    constructor(
        private readonly repositoryTagPort: RepositoryTagPort,
        private readonly repositoryReleasePort: RepositoryReleasePublicationPort,
    ) {}

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
        }

        const sourceTag = `v${param.singleAction.version}`;
        const targetTag = sourceTag.split('.')[0];

        try {
            await this.repositoryTagPort.updateTag(
                param.owner,
                param.repo,
                sourceTag,
                targetTag,
                param.tokens.token,
            );
            const releaseId = await this.repositoryReleasePort.updateRelease(
                param.owner,
                param.repo,
                sourceTag,
                targetTag,
                param.tokens.token,
            );
            if (releaseId) {
                logInfo(`Updated release \`${targetTag}\` from \`${sourceTag}\`: ${releaseId}`);
                result.push(
                    new Result({
                        id: this.taskId,
                        success: true,
                        executed: true,
                        steps: [`Updated release \`${targetTag}\` from \`${sourceTag}\`.`],
                    })
                );
            } else {
                result.push(
                    new Result({
                        id: this.taskId,
                        success: false,
                        executed: true,
                        errors: [
                            `Failed to update release \`${targetTag}\` from \`${sourceTag}\`.`
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
                    steps: [`Failed to update release \`${targetTag}\` from \`${sourceTag}\`.`],
                    errors: [
                        JSON.stringify(error)
                    ],
                })
            );
        }
        return result;
    }
}