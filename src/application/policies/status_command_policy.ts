import { Result } from '../../data/model/result';
import type { CopilotLifecycleLabels } from '../../domain/copilot_lifecycle';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';
import { projectBugbotResultFindingStates } from './bugbot_result_finding_state_projection_policy';
import type { PullRequestReadinessSnapshot } from './pull_request_readiness_policy';
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
    readonly currentConfiguration: { readonly workingBranch?: string; readonly results?: readonly { readonly payload: unknown }[] };
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
    readonly pullRequestReadiness?: PullRequestReadinessSnapshot;
    readonly serverOrigin?: string;
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
        'in-progress': lifecycleLabels.working,
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
    const branch = execution.isPush ? execution.commit?.branch
        : execution.currentConfiguration?.workingBranch || execution.commit?.branch;
    const candidateIssue = parsePositiveSafeInteger(execution.issueNumber)
        ?? parsePositiveSafeInteger(execution.issue?.number);
    const issueNumber = candidateIssue === execution.pullRequest?.number ? undefined : candidateIssue;

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
        ...(issueNumber ? { issueNumber } : {}),
        ...(execution.pullRequest?.number > 0 ? { pullRequestNumber: execution.pullRequest.number } : {}),
        ...(branch ? { branch } : {}),
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
        label('interaction.status.target', snapshot.target === 'pull-request'
            ? `${snapshot.target}${snapshot.pullRequestNumber ? ` / PR #${snapshot.pullRequestNumber}` : ''}${snapshot.issueNumber ? ` / issue #${snapshot.issueNumber}` : ''}`
            : `${snapshot.target}${snapshot.issueNumber ? ` #${snapshot.issueNumber}` : ''}`),
        label('interaction.status.event', `${snapshot.event}${snapshot.action ? ` (${snapshot.action})` : ''}`),
        label('interaction.status.branch', snapshot.branch ?? catalog.render('interaction.status.unknown')),
        label('interaction.status.lifecycle', snapshot.lifecycle ?? catalog.render('interaction.status.notSet')),
        label('interaction.status.waitingFor', snapshot.waitingFor ?? catalog.render('interaction.status.noPendingResponse')),
        label('interaction.status.descriptionPolicy', snapshot.pullRequestDescriptionMode),
        label('interaction.status.issueLabels', snapshot.issueLabels.length > 0 ? snapshot.issueLabels.join(', ') : catalog.render('interaction.status.none')),
        label('interaction.status.pullRequestLabels', snapshot.pullRequestLabels.length > 0 ? snapshot.pullRequestLabels.join(', ') : catalog.render('interaction.status.none')),
    ];
    if (snapshot.findingStateEvidence === 'invalid') {
        lines.push(label('interaction.status.findings', catalog.render(snapshot.pullRequestReadiness ? 'interaction.status.prReadiness.countsUnavailable' : 'interaction.status.findingsInvalid')));
    } else if (snapshot.findingStates) {
        lines.push(label('interaction.status.findings', catalog.render('interaction.status.findingCounts', snapshot.findingStates)));
    }
    if (snapshot.pullRequestReadiness) {
        const readiness = snapshot.pullRequestReadiness;
        const states = ['unavailable', 'pending', 'blocked', 'satisfied', 'not-applicable'];
        const renderState = (state: string) => catalog.render(`interaction.status.prReadiness.${states.includes(state) ? state : 'unavailable'}` as PublicationMessageId);
        const mode = ['off', 'recommend', 'guarded', 'unavailable'].includes(readiness.mode) ? readiness.mode : 'unavailable';
        const head = /^[a-f0-9]{40}$/u.test(readiness.headSha) ? readiness.headSha.slice(0, 8) : catalog.render('interaction.status.notSet');
        const code = /^[a-z0-9-]{1,60}$/u.test(readiness.code) ? readiness.code : 'evidence-unavailable';
        lines.push(`- **${catalog.render('interaction.status.prReadiness')}:** ${renderState(readiness.readiness)} (${mode}; ${catalog.render('interaction.status.prReadiness.revision')} ${head}; ${code})`);
        if (readiness.evidence) for (const group of ['ci', 'coverage', 'bugbot', 'reviews'] as const) {
            lines.push(`- **${catalog.render(`interaction.status.prReadiness.${group}`)}:** ${renderState(readiness.evidence[group])}`);
        }
        const url = verifiedReadinessLink(snapshot, readiness.pullNumber);
        if (url) lines.push(`[${catalog.render('interaction.status.prReadiness.openPr')}](${url})`);
        if (readiness.humanReviewRequired) lines.push(catalog.render('interaction.status.prReadiness.humanReview'));
        const actions = ['retry', 'wait', 'resolve', 'human-review', 'observer', 'select-pr', 'none'];
        const action = readiness.action && actions.includes(readiness.action) ? readiness.action : 'retry';
        if (action !== 'none') lines.push(`${catalog.render('interaction.status.prReadiness.next')}: ${catalog.render(`interaction.status.prReadiness.action.${action}` as PublicationMessageId)}`);
    }
    const rendered = lines.join('\n');
    return snapshot.pullRequestReadiness && rendered.length > 6_000
        ? `${catalog.render('interaction.status.prReadiness.oversize')}\n${catalog.render('interaction.status.prReadiness.action.retry')}` : rendered;
}

function verifiedReadinessLink(snapshot: CopilotStatusSnapshot, number: number | undefined): string | undefined {
    if (!Number.isSafeInteger(number) || !number || number <= 0 || !/^[A-Za-z0-9_.-]+$/u.test(snapshot.owner)
        || !/^[A-Za-z0-9_.-]+$/u.test(snapshot.repository) || [snapshot.owner, snapshot.repository].some(value => value === '.' || value === '..')) return undefined;
    try {
        const url = new URL(snapshot.serverOrigin ?? '');
        return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
            ? `${url.origin}/${snapshot.owner}/${snapshot.repository}/pull/${number}` : undefined;
    } catch { return undefined; }
}
