import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { ParamUseCase } from "../../base/param_usecase";
export declare class DeployedAddedUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string;
    invoke(param: Execution): Promise<Result[]>;
}
