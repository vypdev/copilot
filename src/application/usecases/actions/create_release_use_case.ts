import type { Result } from '../../../data/model/result';
import type { BoundRepositoryReleasePublicationPort } from '../../ports/repository_release_ports';
import type { DeploymentPublicationContext } from '../push_single_action_contexts';
import { logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { ParamUseCase } from '../base/param_usecase';
import { runCreateRelease } from './create_release_workflow';

export class CreateReleaseUseCase implements ParamUseCase<DeploymentPublicationContext, Result[]> {
    taskId = 'CreateReleaseUseCase';

    constructor(private readonly repositoryReleasePort: BoundRepositoryReleasePublicationPort) {}

    async invoke(param: DeploymentPublicationContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runCreateRelease(param, this.taskId, this.repositoryReleasePort);
    }
}
