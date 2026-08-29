import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import { ParamUseCase } from '../base/param_usecase';
import { runRecommendStepsWorkflow } from './recommend_steps_workflow';

/** Application boundary for generating non-duplicated implementation guidance. */
export class RecommendStepsUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'RecommendStepsUseCase';

    constructor(
        private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runRecommendStepsWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            aiRepository: this.aiRepository,
        });
    }
}
