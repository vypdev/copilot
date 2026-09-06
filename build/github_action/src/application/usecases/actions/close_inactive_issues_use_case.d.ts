import type { Execution } from '../../../data/model/execution';
import type { Result } from '../../../data/model/result';
import { ParamUseCase } from '../base/param_usecase';
import type { IssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { IssueInactivityClockPort, IssueInactivityQueryPort } from '../../ports/issue_inactivity_ports';
/** Application boundary for the scheduled inactivity-maintenance action. */
export declare class CloseInactiveIssuesUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly issueQueryPort;
    private readonly issueClosurePort;
    private readonly clock;
    taskId: string;
    constructor(issueQueryPort: IssueInactivityQueryPort, issueClosurePort: IssueClosurePort, clock: IssueInactivityClockPort);
    invoke(param: Execution): Promise<Result[]>;
}
