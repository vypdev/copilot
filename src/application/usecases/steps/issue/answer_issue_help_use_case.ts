import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runAnswerIssueHelpWorkflow } from './answer_issue_help_workflow';
import type { AnswerIssueHelpContext } from '../../issue_workflow_context';

/** Application boundary for the initial response to question/help issues. */
export class AnswerIssueHelpUseCase implements ParamUseCase<AnswerIssueHelpContext, Result[]> {
    taskId = 'AnswerIssueHelpUseCase';

    constructor(
        private readonly issueNotificationPort: BoundIssueNotificationPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: AnswerIssueHelpContext): Promise<Result[]> {
        return await runAnswerIssueHelpWorkflow(param, {
            issueNotificationPort: this.issueNotificationPort,
            aiRepository: this.aiRepository,
        });
    }
}
