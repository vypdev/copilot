import { Execution } from "../../../data/model/execution";
import { Result } from "../../../data/model/result";
import type { RepositoryReleasePublicationPort } from "../../ports/repository_release_ports";
import { ParamUseCase } from "../base/param_usecase";
export declare class CreateReleaseUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly repositoryReleasePort;
    taskId: string;
    constructor(repositoryReleasePort: RepositoryReleasePublicationPort);
    invoke(param: Execution): Promise<Result[]>;
}
