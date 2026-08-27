import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueCommentUpdatePort } from '../../../../application/ports/issue_lifecycle_ports';
import { ParamUseCase } from '../../base/param_usecase';
export declare class CheckPullRequestCommentLanguageUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string;
    private readonly workflow;
    constructor(issueRepository: IssueCommentUpdatePort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
