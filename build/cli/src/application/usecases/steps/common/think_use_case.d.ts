import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { IssueNotificationPort } from '../../../ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
export declare class ThinkUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueDescriptionQueryPort;
    private readonly issueNotificationPort;
    taskId: string;
    private aiRepository;
    constructor(issueDescriptionQueryPort: IssueDescriptionQueryPort, issueNotificationPort: IssueNotificationPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
