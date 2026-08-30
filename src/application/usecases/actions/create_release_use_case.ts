import type { Execution } from '../../../data/model/execution';
import type { Result } from '../../../data/model/result';
import type { RepositoryReleasePublicationPort } from '../../ports/repository_release_ports';
import { logInfo } from '../../ports/logging_ports';
import { getTaskEmoji } from '../../../utils/task_emoji';
import { ParamUseCase } from '../base/param_usecase';
import { runCreateRelease } from './create_release_workflow';

export class CreateReleaseUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'CreateReleaseUseCase';

    constructor(private readonly repositoryReleasePort: RepositoryReleasePublicationPort) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runCreateRelease(param, this.taskId, this.repositoryReleasePort);
    }
}
