/**
 * When a question or help issue is newly opened, posts an initial helpful reply
 * based on the issue description (OpenCode Plan agent). The user can still
 * @mention the bot later for follow-up answers (ThinkUseCase).
 */
import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
export declare class AnswerIssueHelpUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueNotificationPort;
    taskId: string;
    private aiRepository;
    constructor(issueNotificationPort: IssueNotificationPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
