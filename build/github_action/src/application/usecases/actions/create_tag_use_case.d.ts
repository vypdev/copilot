import type { Execution } from "../../../data/model/execution";
import type { Result } from "../../../data/model/result";
import type { RepositoryTagPort } from "../../ports/repository_release_ports";
import { ParamUseCase } from "../base/param_usecase";
export declare class CreateTagUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly repositoryReleasePort;
    taskId: string;
    constructor(repositoryReleasePort: RepositoryTagPort);
    invoke(param: Execution): Promise<Result[]>;
}
