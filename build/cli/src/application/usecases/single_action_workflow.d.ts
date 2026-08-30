import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
export interface SingleActionWorkflowPorts {
    deployedActionUseCase: ParamUseCase<Execution, Result[]>;
    publishGithubActionUseCase: ParamUseCase<Execution, Result[]>;
    createReleaseUseCase: ParamUseCase<Execution, Result[]>;
    createTagUseCase: ParamUseCase<Execution, Result[]>;
    thinkUseCase: ParamUseCase<Execution, Result[]>;
    initialSetupUseCase: ParamUseCase<Execution, Result[]>;
    checkProgressUseCase: ParamUseCase<Execution, Result[]>;
    detectPotentialProblemsUseCase: ParamUseCase<Execution, Result[]>;
    recommendStepsUseCase: ParamUseCase<Execution, Result[]>;
}
export declare function runSingleActionWorkflow(param: Execution, taskId: string, ports: SingleActionWorkflowPorts): Promise<Result[]>;
