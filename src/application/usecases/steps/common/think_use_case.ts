import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runThinkWorkflow } from './think_workflow';

export class ThinkUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'ThinkUseCase';
    private aiRepository: FindingsQueryPort;
    constructor(
        private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
        private readonly issueNotificationPort: IssueNotificationPort,
        aiRepository: FindingsQueryPort,
    ) {
        this.aiRepository = aiRepository;
    }

    async invoke(param: Execution): Promise<Result[]> {
        return runThinkWorkflow(param, this.taskId, {
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            issueNotificationPort: this.issueNotificationPort,
            aiRepository: this.aiRepository,
        });
    }
}
