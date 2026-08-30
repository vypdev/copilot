import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { IssueLabelsPort } from '../../ports/issue_management_ports';
export interface SynchronizeLifecycleStateParam {
    execution: Execution;
    results: readonly Result[];
}
/**
 * Reconciles one state label after a route completes. The existing business
 * labels remain untouched, and repeated events are idempotent.
 */
export declare class SynchronizeLifecycleStateUseCase {
    private readonly issueLabelsPort;
    readonly taskId = "SynchronizeCopilotLifecycleStateUseCase";
    constructor(issueLabelsPort: IssueLabelsPort);
    invoke(param: SynchronizeLifecycleStateParam): Promise<Result[]>;
}
