import type { Execution } from '../../../data/model/execution';
import type { Result } from '../../../data/model/result';
import { ParamUseCase } from '../base/param_usecase';
import type { IssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { IssueInactivityClockPort, IssueInactivityQueryPort } from '../../ports/issue_inactivity_ports';
import { runCloseInactiveIssuesWorkflow } from './close_inactive_issues_workflow';

/** Application boundary for the scheduled inactivity-maintenance action. */
export class CloseInactiveIssuesUseCase implements ParamUseCase<Execution, Result[]> {
    taskId = 'CloseInactiveIssuesUseCase';

    constructor(
        private readonly issueQueryPort: IssueInactivityQueryPort,
        private readonly issueClosurePort: IssueClosurePort,
        private readonly clock: IssueInactivityClockPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return runCloseInactiveIssuesWorkflow(param, {
            issueQueryPort: this.issueQueryPort,
            issueClosurePort: this.issueClosurePort,
            clock: this.clock,
        });
    }
}
