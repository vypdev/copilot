import { replaceAgentActivityLabel } from '../../policies/agent_activity_label_policy';
import type { BoundIssueLabelsPort } from '../../ports/issue_management_ports';
import type { AgentActivityContext, AgentActivityOutcome } from '../push_single_action_contexts';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';
import { toApplicationError } from '../../errors/application_error';

/**
 * Maintains the temporary agent-activity label around a complete route.
 * Cleanup is deliberately best-effort so a label outage never hides the
 * actual route result; the in-memory execution remains synchronized after a
 * successful mutation so later lifecycle writes preserve the activity label.
 */
export class SynchronizeAgentActivityUseCase {
    readonly taskId = 'SynchronizeAgentActivityUseCase';

    constructor(private readonly issueLabelsPort: BoundIssueLabelsPort) {}

    async start(context: AgentActivityContext): Promise<AgentActivityOutcome> {
        return this.synchronize(context, true);
    }

    async finish(context: AgentActivityContext): Promise<AgentActivityOutcome> {
        return this.synchronize(context, false);
    }

    private async synchronize(context: AgentActivityContext, active: boolean): Promise<AgentActivityOutcome> {
        const target = context.target;
        if (!target) {
            logDebugInfo(`${this.taskId}: no issue or pull request target; skipping activity label.`);
            return Object.freeze({});
        }

        try {
            // Route steps may have changed labels through their own ports. Read
            // the latest server inventory before cleanup so removing the
            // transient marker cannot overwrite those changes.
            const currentLabels = active
                ? target.labels
                : await this.issueLabelsPort.getLabels(target.number);
            const configuredLabel = context.activityLabel;
            const nextLabels = replaceAgentActivityLabel(currentLabels, configuredLabel, active);
            if (sameLabels(currentLabels, nextLabels)) return Object.freeze({ target, labels: Object.freeze([...currentLabels]) });

            await this.issueLabelsPort.setLabels(
                target.number,
                nextLabels,
            );
            logInfo(`${active ? 'Added' : 'Removed'} Copilot agent activity label on target #${target.number}.`);
            return Object.freeze({ target, labels: Object.freeze([...nextLabels]) });
        } catch (error) {
            const message = `${this.taskId}: unable to ${active ? 'add' : 'remove'} agent activity label.`;
            const semanticError = toApplicationError(error, 'provider.unavailable', message);
            logError(semanticError);
            return Object.freeze({});
        }
    }
}

function sameLabels(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((label, index) => label === right[index]);
}
