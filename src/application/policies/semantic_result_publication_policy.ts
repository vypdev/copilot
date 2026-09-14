import { publicationTargetToken, type PublicationTarget, type ReplyPublicationIntent, type StatusPublicationIntent } from '../../domain/github_publication';
import type { Result } from '../../data/model/result';
import { getResultPayload } from '../../data/model/result';
import { sanitizeAgentMarkdown } from './github_comment_publication_policy';
import { buildPublicationMarker, buildPublicationReplyMarker, createSemanticDigest } from './publication_identity_policy';
import { resolveStaticPublicationCatalog, type PublicationMessageCatalog } from './publication_message_catalog';
import { buildCopilotHelpMessage, buildCopilotWelcomeMessage } from './copilot_interaction_policy';
import { formatCopilotStatus, type CopilotStatusSnapshot } from './status_command_policy';

export interface PlanPublicationProjection {
    readonly kind: 'plan';
    readonly recommendation: string;
}

export interface ProgressPublicationProjection {
    readonly kind: 'progress';
    readonly progress: number;
    readonly summary: string;
    readonly remaining?: string;
    readonly branch?: string;
    readonly developmentBranch?: string;
}

export type SemanticStatusProjection = PlanPublicationProjection | ProgressPublicationProjection;
export type SemanticStatusIntent = StatusPublicationIntent<SemanticStatusProjection>;

export type SemanticReplyProjection =
    | { readonly kind: 'help'; readonly botLogin: string }
    | { readonly kind: 'welcome'; readonly botLogin: string }
    | { readonly kind: 'direct-answer'; readonly answer: string }
    | { readonly kind: 'access-policy' }
    | { readonly kind: 'status-command'; readonly snapshot: CopilotStatusSnapshot };
export type SemanticReplyIntent = ReplyPublicationIntent<SemanticReplyProjection>;

export interface SemanticPublicationContext {
    readonly locale: string;
    readonly results: readonly Result[];
    readonly target?: PublicationTarget;
    readonly correlationId?: string;
    readonly botLogin?: string;
}

export function selectSemanticStatusIntents(context: SemanticPublicationContext): readonly SemanticStatusIntent[] {
    return Object.freeze(context.results.flatMap(result => {
        if (!result.executed || !result.success) return [];
        const payload = getResultPayload(result.payload);
        if (!payload) return [];
        const plan = planIntent(result.id, payload, context.locale);
        if (plan) return [plan];
        const progress = progressIntent(result.id, payload, context.locale);
        return progress ? [progress] : [];
    }));
}

/** True only when an issue result can become the route's single primary response. */
export function hasPrimaryIssuePublication(results: readonly Result[]): boolean {
    return results.some(result => {
        if (!result.executed || !result.success) return false;
        const payload = getResultPayload(result.payload);
        return Boolean(payload && (
            isPlanPayload(result.id, payload)
            || directAnswerProjection(payload)
        ));
    });
}

export function selectSemanticReplyIntents(context: SemanticPublicationContext): readonly SemanticReplyIntent[] {
    if (!context.target || !positiveInteger(context.target.number) || !context.correlationId?.trim()) return [];
    const correlationId = safeMarkerToken(context.correlationId);
    return Object.freeze(context.results.flatMap(result => {
        if (!result.executed || !result.success) return [];
        const payload = getResultPayload(result.payload);
        if (!payload) return [];
        const directAnswer = directAnswerProjection(payload);
        if (directAnswer) return [replyIntent(context, correlationId, 'direct-answer', directAnswer)];
        const publication = getResultPayload(payload.publication);
        const kind = publication?.kind;
        if (kind === 'help' || kind === 'welcome') {
            const botLogin = typeof publication?.botLogin === 'string' && publication.botLogin.trim()
                ? publication.botLogin.trim()
                : context.botLogin?.trim() ?? '';
            const projection = Object.freeze({ kind, botLogin }) as SemanticReplyProjection;
            return [replyIntent(context, correlationId, `copilot-${kind}`, projection)];
        }
        if (kind === 'access-policy') {
            return [replyIntent(context, correlationId, 'access-policy', Object.freeze({ kind }))];
        }
        const snapshot = getResultPayload(payload.status);
        if (result.id.endsWith('.Status') && isStatusSnapshot(snapshot)) {
            const projection = Object.freeze({
                kind: 'status-command' as const,
                snapshot: copyStatusSnapshot(snapshot),
            });
            return [replyIntent(context, correlationId, 'copilot-status', projection)];
        }
        return [];
    }));
}

export function renderSemanticReply(
    intent: SemanticReplyIntent,
    catalog: PublicationMessageCatalog = resolveStaticPublicationCatalog(intent.locale).catalog,
): string {
    const marker = buildPublicationReplyMarker({
        target: publicationTargetToken(intent.target),
        correlationId: intent.correlationId,
        messageKey: intent.messageKey,
        digest: intent.digest,
    });
    const body = intent.projection.kind === 'direct-answer'
        ? sanitizeAgentMarkdown(intent.projection.answer).trim()
        : intent.projection.kind === 'help'
            ? buildCopilotHelpMessage(intent.projection.botLogin, intent.locale, catalog)
            : intent.projection.kind === 'welcome'
                ? buildCopilotWelcomeMessage(intent.projection.botLogin, intent.locale, catalog)
                : intent.projection.kind === 'access-policy'
                    ? renderAccessPolicyReply(catalog)
                    : formatCopilotStatus(intent.projection.snapshot, intent.locale, catalog);
    return `${marker}\n\n${body}`;
}

function renderAccessPolicyReply(messages: PublicationMessageCatalog): string {
    return [
        `## ${messages.access.heading}`,
        '',
        messages.access.explanation,
        '',
        messages.access.recovery,
    ].join('\n');
}

export function renderSemanticStatus(
    intent: SemanticStatusIntent,
    messages: PublicationMessageCatalog = resolveStaticPublicationCatalog(intent.locale).catalog,
): string {
    const marker = buildPublicationMarker(intent);
    if (intent.projection.kind === 'plan') {
        const plan = sanitizeAgentMarkdown(intent.projection.recommendation, 8_000).trim();
        return [
            marker,
            '',
            `## ${messages.implementationPlan}`,
            '',
            `> **${messages.currentStatus}:** ${messages.planReady}`,
            '',
            plan,
            '',
            `**${messages.planAcceptance}:** ${messages.noActionRequired}`,
            '',
            messages.commandsHint,
        ].join('\n').trim();
    }
    const progress = intent.projection.progress;
    const state = progress <= 0 ? 'not-started' : progress >= 100 ? 'complete' : 'in-progress';
    const lines = [
        marker,
        '',
        `## ${messages.progress}: ${progress}% — ${messages.progressState[state]}`,
        '',
        `> **${messages.currentStatus}:** ${sanitizeAgentMarkdown(intent.projection.summary, 1_500).trim()}`,
    ];
    if (progress < 100 && intent.projection.remaining?.trim()) {
        lines.push('', `**${messages.next}:** ${sanitizeAgentMarkdown(intent.projection.remaining, 3_000).trim()}`);
    } else if (progress >= 100) {
        lines.push('', messages.noActionRequired);
    }
    return lines.join('\n').trim();
}

function planIntent(id: string, payload: Record<string, unknown>, locale: string): SemanticStatusIntent | undefined {
    if (!isPlanPayload(id, payload)) return undefined;
    const state = getResultPayload(payload.recommendationState);
    const issueFingerprint = typeof state?.issueDescriptionFingerprint === 'string'
        ? state.issueDescriptionFingerprint
        : createSemanticDigest(payload.recommendedSteps);
    const projection = Object.freeze<PlanPublicationProjection>({
        kind: 'plan',
        recommendation: payload.recommendedSteps.trim(),
    });
    return statusIntent('plan', payload.issueNumber, 'implementation', `issue-body:${safeDigest(issueFingerprint)}`, locale, projection);
}

function isPlanPayload(
    id: string,
    payload: Record<string, unknown>,
): payload is Record<string, unknown> & { readonly issueNumber: number; readonly recommendedSteps: string } {
    return id === 'RecommendStepsUseCase'
        && positiveInteger(payload.issueNumber)
        && typeof payload.recommendedSteps === 'string'
        && Boolean(payload.recommendedSteps.trim());
}

function directAnswerProjection(payload: Record<string, unknown>): SemanticReplyProjection | undefined {
    const publication = getResultPayload(payload.publication);
    if (publication?.kind !== 'direct-answer'
        || typeof publication.answer !== 'string'
        || !publication.answer.trim()) return undefined;
    return Object.freeze({
        kind: 'direct-answer' as const,
        answer: publication.answer.trim(),
    });
}

function progressIntent(id: string, payload: Record<string, unknown>, locale: string): SemanticStatusIntent | undefined {
    if (id !== 'CheckProgressUseCase'
        || !positiveInteger(payload.issueNumber)
        || typeof payload.progress !== 'number'
        || typeof payload.summary !== 'string') return undefined;
    const progress = Math.max(0, Math.min(100, Math.round(payload.progress)));
    const projection = Object.freeze<ProgressPublicationProjection>({
        kind: 'progress',
        progress,
        summary: payload.summary.trim() || 'Progress was assessed without a summary.',
        ...(typeof payload.remaining === 'string' && payload.remaining.trim()
            ? { remaining: payload.remaining.trim() }
            : {}),
        ...(typeof payload.branch === 'string' && payload.branch.trim() ? { branch: payload.branch.trim() } : {}),
        ...(typeof payload.developmentBranch === 'string' && payload.developmentBranch.trim()
            ? { developmentBranch: payload.developmentBranch.trim() }
            : {}),
    });
    return statusIntent('progress', payload.issueNumber, 'work', `progress:${createSemanticDigest(projection)}`, locale, projection);
}

function statusIntent(
    topic: 'plan' | 'progress',
    issueNumber: number,
    key: string,
    sourceVersion: string,
    locale: string,
    projection: SemanticStatusProjection,
): SemanticStatusIntent {
    return Object.freeze({
        kind: 'status',
        identity: Object.freeze({ topic, target: Object.freeze({ kind: 'issue', number: issueNumber }), key }),
        sourceVersion,
        digest: createSemanticDigest({ locale, projection }),
        locale,
        projection,
    });
}

function positiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function replyIntent(
    context: SemanticPublicationContext,
    correlationId: string,
    messageKey: string,
    projection: SemanticReplyProjection,
): SemanticReplyIntent {
    return Object.freeze({
        kind: 'reply',
        target: context.target!,
        correlationId,
        messageKey,
        locale: context.locale,
        digest: createSemanticDigest({ locale: context.locale, projection }),
        projection,
    });
}

function safeMarkerToken(value: string): string {
    const trimmed = value.trim();
    return /^[A-Za-z0-9._:-]{1,128}$/u.test(trimmed) ? trimmed : `digest:${createSemanticDigest(trimmed)}`;
}

function isStatusSnapshot(value: unknown): value is CopilotStatusSnapshot {
    const record = getResultPayload(value);
    return Boolean(record
        && typeof record.owner === 'string'
        && typeof record.repository === 'string'
        && typeof record.event === 'string'
        && typeof record.action === 'string'
        && ['issue', 'pull-request', 'push', 'repository'].includes(String(record.target))
        && Array.isArray(record.issueLabels)
        && Array.isArray(record.pullRequestLabels)
        && typeof record.pullRequestDescriptionMode === 'string');
}

function copyStatusSnapshot(snapshot: CopilotStatusSnapshot): CopilotStatusSnapshot {
    return Object.freeze({
        ...snapshot,
        issueLabels: Object.freeze([...snapshot.issueLabels]),
        pullRequestLabels: Object.freeze([...snapshot.pullRequestLabels]),
        ...(snapshot.findingStates ? { findingStates: Object.freeze({ ...snapshot.findingStates }) } : {}),
    });
}

function safeDigest(value: string): string {
    return /^[a-f0-9]{8,64}$/u.test(value) ? value : createSemanticDigest(value);
}
