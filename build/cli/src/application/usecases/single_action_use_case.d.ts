import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "./base/param_usecase";
export declare class SingleActionUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly deployedActionUseCase;
    private readonly publishGithubActionUseCase;
    private readonly createReleaseUseCase;
    private readonly createTagUseCase;
    private readonly thinkUseCase;
    private readonly initialSetupUseCase;
    private readonly checkProgressUseCase;
    private readonly detectPotentialProblemsUseCase;
    private readonly recommendStepsUseCase;
    private readonly closeInactiveIssuesUseCase?;
    taskId: string;
    constructor(deployedActionUseCase: ParamUseCase<Execution, Result[]>, publishGithubActionUseCase: ParamUseCase<Execution, Result[]>, createReleaseUseCase: ParamUseCase<Execution, Result[]>, createTagUseCase: ParamUseCase<Execution, Result[]>, thinkUseCase: ParamUseCase<Execution, Result[]>, initialSetupUseCase: ParamUseCase<Execution, Result[]>, checkProgressUseCase: ParamUseCase<Execution, Result[]>, detectPotentialProblemsUseCase: ParamUseCase<Execution, Result[]>, recommendStepsUseCase: ParamUseCase<Execution, Result[]>, closeInactiveIssuesUseCase?: ParamUseCase<Execution, Result[]> | undefined);
    invoke(param: Execution): Promise<Result[]>;
}
