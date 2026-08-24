import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { RepositoryTagPort, RepositoryReleasePublicationPort } from "../../ports/repository_release_ports";
import { ParamUseCase } from "../base/param_usecase";
export declare class PublishGithubActionUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly repositoryTagPort;
    private readonly repositoryReleasePort;
    taskId: string;
    constructor(repositoryTagPort: RepositoryTagPort, repositoryReleasePort: RepositoryReleasePublicationPort);
    invoke(param: Execution): Promise<Result[]>;
}
