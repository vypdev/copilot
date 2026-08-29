import { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { FindingsQueryPort } from '../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../ports/issue_description_ports';
import { ParamUseCase } from '../base/param_usecase';
export declare class RecommendStepsUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueDescriptionQueryPort;
    taskId: string;
    private aiRepository;
    constructor(issueDescriptionQueryPort: IssueDescriptionQueryPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
    private updateDescriptionFingerprint;
}
