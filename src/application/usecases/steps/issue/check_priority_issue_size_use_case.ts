import { Result } from "../../../../data/model/result";
import { logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { runPrioritySizeCheck } from './priority_size_check_use_case';
import type { ProjectBoardPriorityPort } from './priority_size_check_use_case';
import type { PrioritySizeContext } from '../../issue_workflow_context';

export class CheckPriorityIssueSizeUseCase implements ParamUseCase<PrioritySizeContext, Result[]> {
    taskId: string = 'CheckPriorityIssueSizeUseCase';
    constructor(private readonly projectBoardPriorityPort: ProjectBoardPriorityPort) {}
    
    async invoke(param: PrioritySizeContext): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
        return runPrioritySizeCheck(param, this.taskId, this.projectBoardPriorityPort);
    }
}
