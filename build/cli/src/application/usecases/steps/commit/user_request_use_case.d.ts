/**
 * Use case that performs whatever changes the user asked for (generic request).
 * Uses the configured build agent to edit files and run commands in the workspace.
 * Caller is responsible for permission check and for running commit/push after success.
 */
import type { Execution } from "../../../../data/model/execution";
import type { FixerQueryPort } from "../../../ports/agent_fixer_ports";
import { ParamUseCase } from "../../base/param_usecase";
import { Result } from "../../../../data/model/result";
export interface DoUserRequestParam {
    execution: Execution;
    userComment: string;
    branchOverride?: string;
}
export declare class DoUserRequestUseCase implements ParamUseCase<DoUserRequestParam, Result[]> {
    private readonly aiRepository;
    taskId: string;
    constructor(aiRepository: FixerQueryPort);
    invoke(param: DoUserRequestParam): Promise<Result[]>;
}
