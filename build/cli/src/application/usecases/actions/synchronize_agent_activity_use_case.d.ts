import type { Execution } from '../../../data/model/execution';
import type { IssueLabelsPort } from '../../ports/issue_management_ports';
/**
 * Maintains the temporary agent-activity label around a complete route.
 * Cleanup is deliberately best-effort so a label outage never hides the
 * actual route result; the in-memory execution remains synchronized after a
 * successful mutation so later lifecycle writes preserve the activity label.
 */
export declare class SynchronizeAgentActivityUseCase {
    private readonly issueLabelsPort;
    readonly taskId = "SynchronizeAgentActivityUseCase";
    constructor(issueLabelsPort: IssueLabelsPort);
    start(execution: Execution): Promise<void>;
    finish(execution: Execution): Promise<void>;
    private synchronize;
}
