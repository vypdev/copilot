import { Result } from '../../../data/model/result';
import { lifecycleLabelNames, lifecycleStateLabel, waitingLabelNames, waitingStateLabel } from '../../../domain/copilot_lifecycle';
import { readLifecycleExternalEvidence, resolveLifecycleState } from '../../policies/lifecycle_state_policy';
import { resolveLifecycleWaitingState, type LifecycleWaitingStateDecision } from '../../policies/lifecycle_waiting_state_policy';
import type { BoundIssueLabelsPort, BoundPullRequestHeadShaPort } from '../../ports/issue_management_ports';
import { logDebugInfo, logError } from '../../ports/logging_ports';
import { toApplicationError } from '../../errors/application_error';
import {
    lifecycleSynchronizationOutcome,
    type LifecycleSynchronizationContext,
    type LifecycleSynchronizationOutcome,
} from './lifecycle_synchronization_context';

export interface SynchronizeLifecycleStateParam {
    readonly context: LifecycleSynchronizationContext;
    readonly results: readonly Result[];
}

/** Reconciles one state label from immutable facts and bound provider authority. */
export class SynchronizeLifecycleStateUseCase {
    readonly taskId = 'SynchronizeCopilotLifecycleStateUseCase';

    constructor(
        private readonly issueLabelsPort: BoundIssueLabelsPort,
        private readonly pullRequestHeadShaPort: BoundPullRequestHeadShaPort,
    ) {}

    async invoke(param: SynchronizeLifecycleStateParam): Promise<LifecycleSynchronizationOutcome> {
        const target = param.context.target;
        if (!target) {
            logDebugInfo('Lifecycle state synchronization skipped: no issue or pull request number.');
            return lifecycleSynchronizationOutcome();
        }

        const externalEvidence = await this.readExternalEvidence(param.context);
        const state = resolveLifecycleState({
            eventName: param.context.eventName,
            action: param.context.action,
            isIssue: target.kind === 'issue',
            isPullRequest: target.kind === 'pull-request',
            issueOpened: target.kind === 'issue' && target.opened,
            issueDescriptionEdited: target.kind === 'issue' && target.descriptionEdited,
            pullRequestMerged: target.kind === 'pull-request' && target.merged,
            pullRequestClosed: target.kind === 'pull-request' && target.closed,
            externalEvidence,
            results: param.results,
        });
        const waitingDecision = resolveLifecycleWaitingState({
            eventName: param.context.eventName,
            lifecycleState: state,
        });

        try {
            // Route steps may have changed labels. Re-read immediately before
            // replacement so reconciliation cannot overwrite fresher state.
            const currentLabels = await this.issueLabelsPort.getLabels(target.number) ?? target.labels;
            const nextLabels = replaceLifecycleLabels(currentLabels, state, param.context.lifecycleLabels);
            const nextLabelsWithWaiting = replaceWaitingLabels(
                nextLabels,
                waitingDecision,
                param.context.lifecycleLabels,
            );
            if (sameLabels(currentLabels, nextLabelsWithWaiting)) return lifecycleSynchronizationOutcome();

            await this.issueLabelsPort.setLabels(target.number, nextLabelsWithWaiting);
            return lifecycleSynchronizationOutcome([
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: lifecycleSynchronizationSteps(state, waitingDecision),
                }),
            ], {
                target: { kind: target.kind, number: target.number },
                labels: nextLabelsWithWaiting,
            });
        } catch (error) {
            const semanticError = toApplicationError(
                error,
                'provider.unavailable',
                'Unable to synchronize Copilot lifecycle state.',
            );
            logError(semanticError);
            return lifecycleSynchronizationOutcome([
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    errors: [semanticError],
                }),
            ]);
        }
    }

    private async readExternalEvidence(context: LifecycleSynchronizationContext) {
        if (context.evidence.kind === 'none' || context.target?.kind !== 'pull-request') {
            return undefined;
        }
        const currentHeadSha = await this.readCurrentPullRequestHeadSha(context.target.number);
        return readLifecycleExternalEvidence(context.evidence, currentHeadSha);
    }

    private async readCurrentPullRequestHeadSha(pullRequestNumber: number): Promise<string | undefined> {
        try {
            return await this.pullRequestHeadShaPort.getPullRequestHeadSha(pullRequestNumber);
        } catch {
            logDebugInfo('Lifecycle external evidence skipped because the current pull-request head could not be read.');
            return undefined;
        }
    }
}

function replaceLifecycleLabels(
    currentLabels: readonly string[],
    state: Parameters<typeof lifecycleStateLabel>[0] | undefined,
    lifecycleLabels: Parameters<typeof lifecycleLabelNames>[0],
): string[] {
    if (!state) return [...currentLabels];
    const managedLabels = new Set(lifecycleLabelNames(lifecycleLabels).map(label => label.toLowerCase()));
    const retained = currentLabels.filter(label => !managedLabels.has(label.trim().toLowerCase()));
    return [...retained, lifecycleStateLabel(state, lifecycleLabels)];
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
