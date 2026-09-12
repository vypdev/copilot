import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { BoundIssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runThinkWorkflow, type ThinkContext } from './think_workflow';

export class ThinkUseCase implements ParamUseCase<ThinkContext, Result[]> {
    taskId: string = 'ThinkUseCase';
    private aiRepository: FindingsQueryPort;
    constructor(
        private readonly issueDescriptionQueryPort: BoundIssueDescriptionQueryPort,
        private readonly issueNotificationPort: BoundIssueNotificationPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: ThinkContext): Promise<Result[]> {
        return runThinkWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            issueNotificationPort: this.issueNotificationPort,
            aiRepository: this.aiRepository,
        });
    }
}
