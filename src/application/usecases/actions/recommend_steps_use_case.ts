import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import type { RecommendStepsContext, RecommendStepsOutcome } from '../push_single_action_contexts';
import { ParamUseCase } from '../base/param_usecase';
import { runRecommendStepsWorkflow } from './recommend_steps_workflow';

/** Application boundary for generating non-duplicated implementation guidance. */
export class RecommendStepsUseCase implements ParamUseCase<RecommendStepsContext, RecommendStepsOutcome> {
    taskId: string = 'RecommendStepsUseCase';

    constructor(
        private readonly issueDescriptionQueryPort: BoundIssueDescriptionQueryPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: RecommendStepsContext): Promise<RecommendStepsOutcome> {
        return await runRecommendStepsWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            aiRepository: this.aiRepository,
        });
    }
}
