import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runAnswerIssueHelpWorkflow } from './answer_issue_help_workflow';

/** Application boundary for the initial response to question/help issues. */
export class AnswerIssueHelpUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'AnswerIssueHelpUseCase';

    constructor(
        private readonly issueNotificationPort: IssueNotificationPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runAnswerIssueHelpWorkflow(param, {
            issueNotificationPort: this.issueNotificationPort,
            aiRepository: this.aiRepository,
        });
    }
}
