import { Result } from '../../data/model/result';
import type { CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';
import { projectBugbotResultFindingStates } from './bugbot_result_finding_state_projection_policy';
import {
    resolveStaticPublicationCatalog,
    type PublicationMessageCatalog,
    type PublicationMessageId,
} from './publication_message_catalog';

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
        readonly getPullRequestDescriptionMode: () => string;
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
    readonly findingStates?: {
        open: number;
        reopened: number;
        verificationRequired: number;
        unknown: number;
        resolved: number;
    };
    readonly findingStateEvidence?: 'invalid';
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
    const findingStateProjection = projectBugbotResultFindingStates(execution.currentConfiguration?.results ?? []);
    const findingStates = findingStateProjection.status === 'valid' ? findingStateProjection.counts : undefined;

    return Object.freeze({
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
        issueLabels: Object.freeze(issueLabels),
        pullRequestLabels: Object.freeze(pullRequestLabels),
        ...(findingStates ? { findingStates: Object.freeze({
            open: findingStates.open,
            reopened: findingStates.reopened,
            verificationRequired: findingStates['verification-required'],
            unknown: findingStates.unknown,
            resolved: findingStates.fixed + findingStates.obsolete + findingStates.dismissed,
        }) } : {}),
        ...(findingStateProjection.status === 'invalid' ? { findingStateEvidence: 'invalid' as const } : {}),
        pullRequestDescriptionMode: execution.ai.getPullRequestDescriptionMode(),
    });
}

export function buildCopilotStatusResult(snapshot: CopilotStatusSnapshot, taskId: string): Result {
    return new Result({
        id: `${taskId}.Status`,
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [formatCopilotStatus(snapshot)],
        payload: { status: snapshot },
    });
}

export function formatCopilotStatus(
    snapshot: CopilotStatusSnapshot,
    locale = 'en-US',
    catalog: PublicationMessageCatalog = resolveStaticPublicationCatalog(locale).catalog,
): string {
    const label = (id: PublicationMessageId, value: string) => `- **${catalog.render(id)}:** ${value}`;
    const lines = [
        `## ${catalog.render('interaction.status.heading')}`,
        label('interaction.status.repository', `${snapshot.owner}/${snapshot.repository}`),
        label('interaction.status.target', `${snapshot.target}${snapshot.issueNumber ? ` #${snapshot.issueNumber}` : ''}${snapshot.pullRequestNumber ? ` / PR #${snapshot.pullRequestNumber}` : ''}`),
        label('interaction.status.event', `${snapshot.event}${snapshot.action ? ` (${snapshot.action})` : ''}`),
        label('interaction.status.branch', snapshot.branch ?? catalog.render('interaction.status.unknown')),
        label('interaction.status.lifecycle', snapshot.lifecycle ?? catalog.render('interaction.status.notSet')),
        label('interaction.status.waitingFor', snapshot.waitingFor ?? catalog.render('interaction.status.noPendingResponse')),
        label('interaction.status.descriptionPolicy', snapshot.pullRequestDescriptionMode),
        label('interaction.status.issueLabels', snapshot.issueLabels.length > 0 ? snapshot.issueLabels.join(', ') : catalog.render('interaction.status.none')),
        label('interaction.status.pullRequestLabels', snapshot.pullRequestLabels.length > 0 ? snapshot.pullRequestLabels.join(', ') : catalog.render('interaction.status.none')),
    ];
    if (snapshot.findingStateEvidence === 'invalid') {
        lines.push(label('interaction.status.findings', catalog.render('interaction.status.findingsInvalid')));
    } else if (snapshot.findingStates) {
        lines.push(label('interaction.status.findings', catalog.render('interaction.status.findingCounts', snapshot.findingStates)));
    }
    return lines.join('\n');
}
