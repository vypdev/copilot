import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { IssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { IssueInactivityClockPort, IssueInactivityQueryPort } from '../../ports/issue_inactivity_ports';
export interface CloseInactiveIssuesWorkflowDependencies {
    readonly issueQueryPort: IssueInactivityQueryPort;
    readonly issueClosurePort: IssueClosurePort;
    readonly clock: IssueInactivityClockPort;
}
/** Scans waiting issues and closes only candidates that remain inactive. */
export declare function runCloseInactiveIssuesWorkflow(param: Execution, dependencies: CloseInactiveIssuesWorkflowDependencies): Promise<Result[]>;
