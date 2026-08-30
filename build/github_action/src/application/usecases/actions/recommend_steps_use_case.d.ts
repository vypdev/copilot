import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import { ParamUseCase } from '../base/param_usecase';
/** Application boundary for generating non-duplicated implementation guidance. */
export declare class RecommendStepsUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueDescriptionQueryPort;
    private readonly aiRepository;
    taskId: string;
    constructor(issueDescriptionQueryPort: IssueDescriptionQueryPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
}
