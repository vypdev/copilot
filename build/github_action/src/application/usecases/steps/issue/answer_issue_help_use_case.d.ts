import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
/** Application boundary for the initial response to question/help issues. */
export declare class AnswerIssueHelpUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueNotificationPort;
    private readonly aiRepository;
    taskId: string;
    constructor(issueNotificationPort: IssueNotificationPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
