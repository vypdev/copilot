import type { Execution } from "../../../data/model/execution";
import type { Result } from "../../../data/model/result";
import type { RepositoryTagPort, RepositoryReleasePublicationPort } from "../../ports/repository_release_ports";
import { logInfo } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";
import { runPublishGithubAction } from './publish_github_action_workflow';


export class PublishGithubActionUseCase  implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'PublishGithubActionUseCase';
    
    constructor(
        private readonly repositoryTagPort: RepositoryTagPort,
        private readonly repositoryReleasePort: RepositoryReleasePublicationPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPublishGithubAction(param, this.taskId, this.repositoryTagPort, this.repositoryReleasePort);
    }
}
