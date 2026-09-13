import type { Result } from "../../../data/model/result";
import type { BoundRepositoryTagPort } from "../../ports/repository_release_ports";
import type { DeploymentPublicationContext } from '../push_single_action_contexts';
import { logInfo } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";
import { runCreateTag } from './create_tag_workflow';


export class CreateTagUseCase  implements ParamUseCase<DeploymentPublicationContext, Result[]> {
    taskId: string = 'CreateTagUseCase';
    
    constructor(private readonly repositoryReleasePort: BoundRepositoryTagPort) {}

    async invoke(param: DeploymentPublicationContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runCreateTag(param, this.taskId, this.repositoryReleasePort);
    }
}
