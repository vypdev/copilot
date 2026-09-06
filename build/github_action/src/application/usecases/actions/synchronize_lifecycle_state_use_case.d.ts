import { Result } from '../../../data/model/result';
import type { ExecutionInputs } from '../../../data/model/execution_inputs';
import type { CopilotLifecycleLabels } from '../../../domain/copilot_lifecycle';
import type { IssueLabelsPort, PullRequestHeadShaPort } from '../../ports/issue_management_ports';
export interface SynchronizeLifecycleStateParam {
    execution: LifecycleSynchronizationExecution;
    results: readonly Result[];
}
/** Narrow runtime context required by lifecycle reconciliation. */
export interface LifecycleSynchronizationExecution {
    readonly owner: string;
    readonly repo: string;
    readonly eventName: string;
    readonly inputs: ExecutionInputs | undefined;
    readonly issueNumber: number;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly issue: {
        readonly number: number;
        readonly opened: boolean;
        readonly descriptionEdited: boolean;
    };
    readonly pullRequest: {
        readonly number: number;
        readonly isMerged: boolean;
        readonly isClosed: boolean;
    };
    readonly labels: {
        currentIssueLabels: string[];
        currentPullRequestLabels: string[];
        readonly lifecycle: CopilotLifecycleLabels;
    };
    readonly tokens: {
        readonly token: string;
    };
}
/**
 * Reconciles one state label after a route completes. The existing business
 * labels remain untouched, and repeated events are idempotent.
 */
export declare class SynchronizeLifecycleStateUseCase {
    private readonly issueLabelsPort;
    private readonly pullRequestHeadShaPort?;
    readonly taskId = "SynchronizeCopilotLifecycleStateUseCase";
    constructor(issueLabelsPort: IssueLabelsPort, pullRequestHeadShaPort?: PullRequestHeadShaPort | undefined);
    invoke(param: SynchronizeLifecycleStateParam): Promise<Result[]>;
    private readExternalEvidence;
    private readCurrentPullRequestHeadSha;
}
