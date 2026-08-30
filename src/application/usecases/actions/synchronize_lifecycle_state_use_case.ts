import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import { lifecycleLabelNames, lifecycleStateLabel } from '../../../domain/copilot_lifecycle';
import { resolveLifecycleState } from '../../policies/lifecycle_state_policy';
import type { IssueLabelsPort } from '../../ports/issue_management_ports';
import { logDebugInfo, logError } from '../../ports/logging_ports';

export interface SynchronizeLifecycleStateParam {
    execution: Execution;
    results: readonly Result[];
}

/**
 * Reconciles one state label after a route completes. The existing business
 * labels remain untouched, and repeated events are idempotent.
 */
export class SynchronizeLifecycleStateUseCase {
    readonly taskId = 'SynchronizeCopilotLifecycleStateUseCase';

    constructor(private readonly issueLabelsPort: IssueLabelsPort) {}

    async invoke(param: SynchronizeLifecycleStateParam): Promise<Result[]> {
        const state = resolveLifecycleState({
            eventName: param.execution.eventName,
            action: param.execution.inputs?.action ?? '',
            isIssue: ['issues', 'issue_comment'].includes(param.execution.eventName),
            isPullRequest: param.execution.eventName === 'pull_request',
            issueOpened: param.execution.issue.opened,
            issueDescriptionEdited: param.execution.issue.descriptionEdited,
            pullRequestMerged: param.execution.pullRequest.isMerged,
            pullRequestClosed: param.execution.pullRequest.isClosed,
            results: param.results,
        });
        if (!state) return [];

        const issueNumber = targetNumber(param.execution);
        if (issueNumber <= 0) {
            logDebugInfo('Lifecycle state synchronization skipped: no issue or pull request number.');
            return [];
        }

        const currentLabels = targetLabels(param.execution);
        const nextLabels = replaceLifecycleLabels(currentLabels, state, param.execution.labels.lifecycle);
        if (sameLabels(currentLabels, nextLabels)) return [];

        try {
            await this.issueLabelsPort.setLabels(
                param.execution.owner,
                param.execution.repo,
                issueNumber,
                nextLabels,
                param.execution.tokens.token,
            );
            setTargetLabels(param.execution, nextLabels);
            return [new Result({
                id: this.taskId,
                success: true,
                executed: true,
                steps: [`Lifecycle state synchronized to \`${state}\`.`],
            })];
        } catch (error) {
            const message = `Unable to synchronize Copilot lifecycle state: ${error instanceof Error ? error.message : String(error)}`;
            logError(message);
            return [new Result({ id: this.taskId, success: false, executed: true, errors: [message] })];
        }
    }
}

function targetNumber(execution: Execution): number {
    if (['issues', 'issue_comment'].includes(execution.eventName)) return execution.issue.number;
    if (execution.eventName === 'pull_request') return execution.pullRequest.number;
    return -1;
}

function targetLabels(execution: Execution): string[] {
    return execution.eventName === 'pull_request'
        ? execution.labels.currentPullRequestLabels
        : execution.labels.currentIssueLabels;
}

function setTargetLabels(execution: Execution, labels: string[]): void {
    if (execution.eventName === 'pull_request') execution.labels.currentPullRequestLabels = labels;
    else execution.labels.currentIssueLabels = labels;
}

function replaceLifecycleLabels(
    currentLabels: readonly string[],
    state: Parameters<typeof lifecycleStateLabel>[0],
    lifecycleLabels: Parameters<typeof lifecycleLabelNames>[0],
): string[] {
    const managedLabels = new Set(lifecycleLabelNames(lifecycleLabels).map(label => label.toLowerCase()));
    const retained = currentLabels.filter(label => !managedLabels.has(label.trim().toLowerCase()));
    const next = lifecycleStateLabel(state, lifecycleLabels);
    return [...retained, next];
}

function sameLabels(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((label, index) => label === right[index]);
}
