import { getResultPayload, Result } from '../../data/model/result';
import type { CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';

export interface CopilotStatusExecutionContext {
    readonly owner: string;
    readonly repo: string;
    readonly eventName: string;
    readonly issueNumber: number;
    readonly isIssue: boolean;
    readonly isPush: boolean;
    readonly isPullRequest: boolean;
    readonly inputs?: { readonly action?: string };
    readonly issue: { readonly number: number };
    readonly pullRequest: {
        readonly number: number;
        readonly isPullRequestReviewComment: boolean;
    };
    readonly commit: { readonly branch: string };
    readonly labels: {
        readonly currentIssueLabels?: readonly string[];
        readonly currentPullRequestLabels?: readonly string[];
        readonly lifecycle?: CopilotLifecycleLabels;
    };
    readonly currentConfiguration: { readonly results?: readonly { readonly payload: unknown }[] };
    readonly ai: {
        readonly getAiPullRequestDescription: () => boolean;
        readonly getPullRequestDescriptionMode?: () => string;
    };
}

export interface CopilotStatusSnapshot {
    readonly owner: string;
    readonly repository: string;
    readonly event: string;
    readonly action: string;
    readonly target: 'issue' | 'pull-request' | 'push' | 'repository';
    readonly issueNumber?: number;
    readonly pullRequestNumber?: number;
    readonly branch?: string;
    readonly lifecycle?: string;
    readonly waitingFor?: string;
    readonly issueLabels: readonly string[];
    readonly pullRequestLabels: readonly string[];
    readonly activeFindings?: { open: number; reopened: number; resolved: number };
    readonly pullRequestDescriptionMode: string;
}

/** Builds a read-only status snapshot from the facts already loaded by setup. */
export function buildCopilotStatusSnapshot(execution: CopilotStatusExecutionContext): CopilotStatusSnapshot {
    const issueLabels = [...(execution.labels?.currentIssueLabels ?? [])];
    const pullRequestLabels = [...(execution.labels?.currentPullRequestLabels ?? [])];
    const isPullRequestTarget = execution.isPullRequest || execution.pullRequest?.number > 0 || execution.pullRequest?.isPullRequestReviewComment;
    const targetLabels = isPullRequestTarget ? pullRequestLabels : issueLabels;
    const lifecycleLabels: Partial<CopilotLifecycleLabels> = execution.labels?.lifecycle ?? {};
    const lifecycle = Object.entries({
        planned: lifecycleLabels.planned,
        'in-progress': lifecycleLabels.inProgress,
        reviewing: lifecycleLabels.reviewing,
        'changes-requested': lifecycleLabels.changesRequested,
        verified: lifecycleLabels.verified,
        ready: lifecycleLabels.ready,
        blocked: lifecycleLabels.blocked,
    }).find(([, label]) => label && targetLabels.includes(label))?.[0];
    const waitingFor = Object.entries({
        maintainer: lifecycleLabels.awaitingMaintainer,
        'issue-author': lifecycleLabels.awaitingIssueAuthor,
    }).find(([, label]) => label && targetLabels.includes(label))?.[0];
    const findingStates = execution.currentConfiguration?.results
        ?.map(result => getResultPayload(result.payload)?.findingStates)
        .find(isFindingStateCounts);

    return {
        owner: execution.owner,
        repository: execution.repo,
        event: execution.eventName || 'unknown',
        action: execution.inputs?.action ?? '',
        target: execution.pullRequest?.number > 0 || execution.pullRequest?.isPullRequestReviewComment
            ? 'pull-request'
            : execution.isPush
                ? 'push'
                : execution.issue?.number > 0 || execution.isIssue
                    ? 'issue'
                    : 'repository',
        ...(execution.issue?.number > 0 ? { issueNumber: execution.issue.number } : {}),
        ...(execution.pullRequest?.number > 0 ? { pullRequestNumber: execution.pullRequest.number } : {}),
        ...(execution.commit?.branch ? { branch: execution.commit.branch } : {}),
        ...(lifecycle ? { lifecycle } : {}),
        ...(waitingFor ? { waitingFor } : {}),
        issueLabels,
        pullRequestLabels,
        ...(findingStates ? { activeFindings: findingStates } : {}),
        pullRequestDescriptionMode: execution.ai.getPullRequestDescriptionMode?.()
            ?? (execution.ai.getAiPullRequestDescription() ? 'replace' : 'disabled'),
    };
}

export function buildCopilotStatusResult(execution: CopilotStatusExecutionContext, taskId: string): Result {
    const snapshot = buildCopilotStatusSnapshot(execution);
    return new Result({
        id: `${taskId}.Status`,
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [formatCopilotStatus(snapshot)],
        payload: { status: snapshot },
    });
}

export function formatCopilotStatus(snapshot: CopilotStatusSnapshot): string {
    const lines = [
        '## Copilot status',
        `- **Repository:** ${snapshot.owner}/${snapshot.repository}`,
        `- **Target:** ${snapshot.target}${snapshot.issueNumber ? ` #${snapshot.issueNumber}` : ''}${snapshot.pullRequestNumber ? ` / PR #${snapshot.pullRequestNumber}` : ''}`,
        `- **Event:** ${snapshot.event}${snapshot.action ? ` (${snapshot.action})` : ''}`,
        `- **Branch:** ${snapshot.branch ?? 'unknown'}`,
        `- **Lifecycle:** ${snapshot.lifecycle ?? 'not set'}`,
        `- **Waiting for:** ${snapshot.waitingFor ?? 'no pending human response'}`,
        `- **PR description policy:** ${snapshot.pullRequestDescriptionMode}`,
        `- **Issue labels:** ${snapshot.issueLabels.length > 0 ? snapshot.issueLabels.join(', ') : 'none'}`,
        `- **PR labels:** ${snapshot.pullRequestLabels.length > 0 ? snapshot.pullRequestLabels.join(', ') : 'none'}`,
    ];
    if (snapshot.activeFindings) {
        lines.push(`- **Bugbot findings:** ${snapshot.activeFindings.open} open, ${snapshot.activeFindings.reopened} reopened, ${snapshot.activeFindings.resolved} resolved`);
    }
    return lines.join('\n');
}

function isFindingStateCounts(value: unknown): value is { open: number; reopened: number; resolved: number } {
    return typeof value === 'object'
        && value !== null
        && typeof (value as { open?: unknown }).open === 'number'
        && typeof (value as { reopened?: unknown }).reopened === 'number'
        && typeof (value as { resolved?: unknown }).resolved === 'number';
}
