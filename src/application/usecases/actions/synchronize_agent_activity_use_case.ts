import type { Execution } from '../../../data/model/execution';
import { activityLabel } from '../../../domain/copilot_lifecycle';
import { replaceAgentActivityLabel } from '../../policies/agent_activity_label_policy';
import type { IssueLabelsPort } from '../../ports/issue_management_ports';
import { logDebugInfo, logError, logInfo } from '../../ports/logging_ports';

/**
 * Maintains the temporary agent-activity label around a complete route.
 * Cleanup is deliberately best-effort so a label outage never hides the
 * actual route result; the in-memory execution remains synchronized after a
 * successful mutation so later lifecycle writes preserve the activity label.
 */
export class SynchronizeAgentActivityUseCase {
    readonly taskId = 'SynchronizeAgentActivityUseCase';

    constructor(private readonly issueLabelsPort: IssueLabelsPort) {}

    async start(execution: Execution): Promise<void> {
        await this.synchronize(execution, true);
    }

    async finish(execution: Execution): Promise<void> {
        await this.synchronize(execution, false);
    }

    private async synchronize(execution: Execution, active: boolean): Promise<void> {
        const target = resolveTarget(execution);
        if (!target) {
            logDebugInfo(`${this.taskId}: no issue or pull request target; skipping activity label.`);
            return;
        }

        try {
            // Route steps may have changed labels through their own ports. Read
            // the latest server inventory before cleanup so removing the
            // transient marker cannot overwrite those changes.
            const currentLabels = active
                ? target.labels
                : await this.issueLabelsPort.getLabels(
                    execution.owner,
                    execution.repo,
                    target.number,
                    execution.tokens.token,
                );
            const configuredLabel = activityLabel(execution.labels.lifecycle);
            const nextLabels = replaceAgentActivityLabel(currentLabels, configuredLabel, active);
            if (sameLabels(currentLabels, nextLabels)) return;

            await this.issueLabelsPort.setLabels(
                execution.owner,
                execution.repo,
                target.number,
                nextLabels,
                execution.tokens.token,
            );
            target.setLabels(nextLabels);
            logInfo(`${active ? 'Added' : 'Removed'} Copilot agent activity label on target #${target.number}.`);
        } catch (error) {
            const message = `${this.taskId}: unable to ${active ? 'add' : 'remove'} agent activity label.`;
            logError(message, error instanceof Error ? { stack: error.stack } : undefined);
        }
    }
}

interface LabelTarget {
    number: number;
    labels: string[];
    setLabels: (labels: string[]) => void;
}

function resolveTarget(execution: Execution): LabelTarget | undefined {
    if (execution.eventName === 'pull_request' || execution.eventName === 'pull_request_review_comment') {
        if (execution.pullRequest.number <= 0) return undefined;
        return {
            number: execution.pullRequest.number,
            labels: execution.labels.currentPullRequestLabels,
            setLabels: labels => { execution.labels.currentPullRequestLabels = labels; },
        };
    }

    const number = execution.issue.number > 0 ? execution.issue.number : execution.issueNumber;
    if (number <= 0) return undefined;
    return {
        number,
        labels: execution.labels.currentIssueLabels,
        setLabels: labels => { execution.labels.currentIssueLabels = labels; },
    };
}

function sameLabels(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((label, index) => label === right[index]);
}
