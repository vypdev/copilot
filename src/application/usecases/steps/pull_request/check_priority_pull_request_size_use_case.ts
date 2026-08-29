import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runPrioritySizeCheck } from "../issue/priority_size_check_use_case";
import type { ProjectBoardPriorityPort } from "../issue/priority_size_check_use_case";

export class CheckPriorityPullRequestSizeUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CheckPriorityPullRequestSizeUseCase';
    constructor(private readonly projectBoardPriorityPort: ProjectBoardPriorityPort) {}
    
    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPrioritySizeCheck(param, this.taskId, param.pullRequest.number, this.projectBoardPriorityPort);
    }
}
