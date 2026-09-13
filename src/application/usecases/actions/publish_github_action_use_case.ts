import type { Result } from "../../../data/model/result";
import type { BoundRepositoryTagPort, BoundRepositoryReleasePublicationPort } from "../../ports/repository_release_ports";
import type { DeploymentPublicationContext } from '../push_single_action_contexts';
import { logInfo } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";
import { runPublishGithubAction } from './publish_github_action_workflow';


export class PublishGithubActionUseCase  implements ParamUseCase<DeploymentPublicationContext, Result[]> {
    taskId: string = 'PublishGithubActionUseCase';
    
    constructor(
        private readonly repositoryTagPort: BoundRepositoryTagPort,
        private readonly repositoryReleasePort: BoundRepositoryReleasePublicationPort,
    ) {}

    async invoke(param: DeploymentPublicationContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPublishGithubAction(param, this.taskId, this.repositoryTagPort, this.repositoryReleasePort);
    }
}
