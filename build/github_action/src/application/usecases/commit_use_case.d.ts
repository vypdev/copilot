import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "./base/param_usecase";
import { CheckProgressUseCase } from "./actions/check_progress_use_case";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
export declare class CommitUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly notifyNewCommitUseCase;
    private readonly checkChangesIssueSizeUseCase;
    private readonly detectPotentialProblemsUseCase;
    private readonly checkProgressUseCase;
    private readonly actorAuthorizationPort?;
    taskId: string;
    constructor(notifyNewCommitUseCase: ParamUseCase<Execution, Result[]>, checkChangesIssueSizeUseCase: ParamUseCase<Execution, Result[]>, detectPotentialProblemsUseCase: ParamUseCase<Execution, Result[]>, checkProgressUseCase: CheckProgressUseCase, actorAuthorizationPort?: ActorAuthorizationPort | undefined);
    invoke(param: Execution): Promise<Result[]>;
}
