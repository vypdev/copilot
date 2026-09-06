import { Result } from '../../../data/model/result';
import type { ExecutionInputs } from '../../../data/model/execution_inputs';
import type { CopilotLifecycleLabels } from '../../../domain/copilot_lifecycle';
import { lifecycleLabelNames, lifecycleStateLabel, waitingLabelNames, waitingStateLabel } from '../../../domain/copilot_lifecycle';
import { readLifecycleExternalEvidence, resolveLifecycleState } from '../../policies/lifecycle_state_policy';
import { resolveLifecycleWaitingState, type LifecycleWaitingStateDecision } from '../../policies/lifecycle_waiting_state_policy';
import type { IssueLabelsPort, PullRequestHeadShaPort } from '../../ports/issue_management_ports';
import { logDebugInfo, logError } from '../../ports/logging_ports';

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
    readonly tokens: { readonly token: string };
}

const PULL_REQUEST_LIFECYCLE_EVENTS = [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
    'check_suite',
    'workflow_run',
];

/**
 * Reconciles one state label after a route completes. The existing business
 * labels remain untouched, and repeated events are idempotent.
 */
export class SynchronizeLifecycleStateUseCase {
    readonly taskId = 'SynchronizeCopilotLifecycleStateUseCase';

    constructor(
        private readonly issueLabelsPort: IssueLabelsPort,
        private readonly pullRequestHeadShaPort?: PullRequestHeadShaPort,
    ) {}

    async invoke(param: SynchronizeLifecycleStateParam): Promise<Result[]> {
        const externalEvidence = await this.readExternalEvidence(param.execution);
        const state = resolveLifecycleState({
            eventName: param.execution.eventName,
            action: param.execution.inputs?.action ?? '',
            isIssue: ['issues', 'issue_comment'].includes(param.execution.eventName),
            isPullRequest: param.execution.isPullRequest || PULL_REQUEST_LIFECYCLE_EVENTS.includes(param.execution.eventName),
            issueOpened: param.execution.issue.opened,
            issueDescriptionEdited: param.execution.issue.descriptionEdited,
            pullRequestMerged: param.execution.pullRequest.isMerged,
            pullRequestClosed: param.execution.pullRequest.isClosed,
            externalEvidence,
            results: param.results,
        });
        const waitingDecision = resolveLifecycleWaitingState({
            eventName: param.execution.eventName,
            lifecycleState: state,
        });

        const issueNumber = targetNumber(param.execution);
        if (issueNumber <= 0) {
            logDebugInfo('Lifecycle state synchronization skipped: no issue or pull request number.');
            return [];
        }

        try {
            // Route steps may have changed labels through their own ports. Use
            // the latest server inventory before reconciliation so this
            // use case cannot overwrite those changes with setup-time data.
            const currentLabels = await this.issueLabelsPort.getLabels(
                param.execution.owner,
                param.execution.repo,
                issueNumber,
                param.execution.tokens.token,
            ) ?? targetLabels(param.execution);
            const nextLabels = replaceLifecycleLabels(currentLabels, state, param.execution.labels.lifecycle);
            const nextLabelsWithWaiting = replaceWaitingLabels(
                nextLabels,
                waitingDecision,
                param.execution.labels.lifecycle,
            );
            if (sameLabels(currentLabels, nextLabelsWithWaiting)) return [];

            await this.issueLabelsPort.setLabels(
                param.execution.owner,
                param.execution.repo,
                issueNumber,
                nextLabelsWithWaiting,
                param.execution.tokens.token,
            );
            setTargetLabels(param.execution, nextLabelsWithWaiting);
            return [new Result({
                id: this.taskId,
                success: true,
                executed: true,
                steps: lifecycleSynchronizationSteps(state, waitingDecision),
            })];
        } catch (error) {
            const message = `Unable to synchronize Copilot lifecycle state: ${error instanceof Error ? error.message : String(error)}`;
            logError(message);
            return [new Result({ id: this.taskId, success: false, executed: true, errors: [message] })];
        }
    }

    private async readExternalEvidence(execution: LifecycleSynchronizationExecution) {
        const eventName = execution.inputs?.eventName;
        if (!['check_suite', 'workflow_run', 'pull_request_review'].includes(eventName ?? '')) {
            return readLifecycleExternalEvidence(execution.inputs);
        }
        const pullRequestHeadSha = execution.inputs?.pull_request?.head?.sha
            ?? await this.readCurrentPullRequestHeadSha(execution);
        return readLifecycleExternalEvidence(execution.inputs, pullRequestHeadSha);
    }

    private async readCurrentPullRequestHeadSha(execution: LifecycleSynchronizationExecution): Promise<string | undefined> {
        if (!this.pullRequestHeadShaPort || execution.pullRequest.number <= 0) return undefined;
        try {
            return await this.pullRequestHeadShaPort.getPullRequestHeadSha(
                execution.owner,
                execution.repo,
                execution.pullRequest.number,
                execution.tokens.token,
            );
        } catch {
            logDebugInfo('Lifecycle external evidence skipped because the current pull-request head could not be read.');
            return undefined;
        }
    }
}

function targetNumber(execution: LifecycleSynchronizationExecution): number {
    if (['issues', 'issue_comment', 'push'].includes(execution.eventName)) {
        return execution.issue.number > 0 ? execution.issue.number : execution.issueNumber;
    }
    if (PULL_REQUEST_LIFECYCLE_EVENTS.includes(execution.eventName)) return execution.pullRequest.number;
    return -1;
}

function targetLabels(execution: LifecycleSynchronizationExecution): string[] {
    return PULL_REQUEST_LIFECYCLE_EVENTS.includes(execution.eventName)
        ? execution.labels.currentPullRequestLabels
        : execution.labels.currentIssueLabels;
}

function setTargetLabels(execution: LifecycleSynchronizationExecution, labels: string[]): void {
    if (PULL_REQUEST_LIFECYCLE_EVENTS.includes(execution.eventName)) {
        execution.labels.currentPullRequestLabels = labels;
    }
    else execution.labels.currentIssueLabels = labels;
}

function replaceLifecycleLabels(
    currentLabels: readonly string[],
    state: Parameters<typeof lifecycleStateLabel>[0] | undefined,
    lifecycleLabels: Parameters<typeof lifecycleLabelNames>[0],
): string[] {
    if (!state) return [...currentLabels];
    const managedLabels = new Set(lifecycleLabelNames(lifecycleLabels).map(label => label.toLowerCase()));
    const retained = currentLabels.filter(label => !managedLabels.has(label.trim().toLowerCase()));
    const next = lifecycleStateLabel(state, lifecycleLabels);
    return [...retained, next];
}

function replaceWaitingLabels(
    currentLabels: readonly string[],
    decision: LifecycleWaitingStateDecision,
    lifecycleLabels: Parameters<typeof waitingLabelNames>[0],
): string[] {
    if (decision.kind === 'preserve') return [...currentLabels];
    const managedLabels = new Set(waitingLabelNames(lifecycleLabels).map(label => label.toLowerCase()));
    const retained = currentLabels.filter(label => !managedLabels.has(label.trim().toLowerCase()));
    if (decision.kind === 'clear') return retained;
    return [...retained, waitingStateLabel(decision.state, lifecycleLabels)];
}

function lifecycleSynchronizationSteps(
    state: Parameters<typeof lifecycleStateLabel>[0] | undefined,
    waitingDecision: LifecycleWaitingStateDecision,
): string[] {
    const steps: string[] = [];
    if (state) steps.push(`Lifecycle state synchronized to \`${state}\`.`);
    if (waitingDecision.kind === 'set') {
        steps.push(`Waiting state synchronized to \`${waitingDecision.state}\`.`);
    } else if (waitingDecision.kind === 'clear') {
        steps.push('Waiting state cleared.');
    }
    return steps;
}

function sameLabels(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((label, index) => label === right[index]);
}
