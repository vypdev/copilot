import type { Execution } from "../../../data/model/execution";
import type { Result } from "../../../data/model/result";
import type { RepositoryTagPort } from "../../ports/repository_release_ports";
import { logInfo } from "../../ports/logging_ports";
import { getTaskEmoji } from "../../../utils/task_emoji";
import { ParamUseCase } from "../base/param_usecase";
import { runCreateTag } from './create_tag_workflow';


export class CreateTagUseCase  implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CreateTagUseCase';
    
    constructor(private readonly repositoryReleasePort: RepositoryTagPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runCreateTag(param, this.taskId, this.repositoryReleasePort);
    }
}
