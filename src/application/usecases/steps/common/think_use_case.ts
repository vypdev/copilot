import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runThinkWorkflow, type ThinkContext } from './think_workflow';

export class ThinkUseCase implements ParamUseCase<ThinkContext, Result[]> {
    taskId: string = 'ThinkUseCase';
    private aiRepository: FindingsQueryPort;
    constructor(
        private readonly issueDescriptionQueryPort: BoundIssueDescriptionQueryPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: ThinkContext): Promise<Result[]> {
        return runThinkWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            aiRepository: this.aiRepository,
        });
    }
}
