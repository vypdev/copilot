import { publicationTargetToken, type PublicationTarget, type ReplyPublicationIntent, type StatusPublicationIntent } from '../../domain/github_publication';
import { githubUsersMatch } from '../../domain/github_user_policy';
import type { Result } from '../../data/model/result';
import { getResultPayload } from '../../data/model/result';
import { sanitizeAgentMarkdown } from './github_comment_publication_policy';
import {
    buildPublicationMarker,
    buildPublicationReplyMarker,
    createSemanticDigest,
    parsePublicationMarker,
    parsePublicationReplyMarker,
} from './publication_identity_policy';
import {
    ENGLISH_PUBLICATION_CATALOG,
    resolveStaticPublicationCatalog,
    type PublicationMessageCatalog,
} from './publication_message_catalog';
import {
    buildCopilotHelpMessage,
    buildCopilotWelcomeMessage,
    COPILOT_WELCOME_MARKER,
} from './copilot_interaction_policy';
import { formatCopilotStatus, type CopilotStatusSnapshot } from './status_command_policy';
import {
    renderTranslationContext,
    type TranslationPublication,
} from './comment_translation_policy';
import {
    renderApplicationErrorMarkdown,
    type ApplicationErrorPresentationSource,
} from './application_error_presentation_policy';
import { canonicalGitObjectId } from '../../domain/git_object_id';

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
    | {
        readonly kind: 'direct-answer';
        readonly answer: string;
        readonly translation?: TranslationPublication;
    }
    | { readonly kind: 'application-error'; readonly error: ApplicationErrorPresentationSource }
    | {
        readonly kind: 'branch-sync-result';
        readonly outcome: 'already-aligned' | 'dry-run-clean' | 'dry-run-conflicted' | 'merged-cleanly' | 'merged-with-agent';
        readonly parentBranch: string;
        readonly workingBranch: string;
        readonly conflictCount: number;
        readonly verificationCount: number;
        readonly commitSha?: string;
    }
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

export interface SemanticPublicationComment {
    readonly body: string | null;
    readonly user?: { readonly login?: string };
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

/** Recognizes only bot-owned primary-response markers on the exact issue comment list. */
export function hasOwnedPrimaryIssuePublication(
    comments: readonly SemanticPublicationComment[],
    issueNumber: number,
    botLogin: string,
): boolean {
    if (!positiveInteger(issueNumber) || !botLogin.trim()) return false;
    const expectedTarget = `issue:${issueNumber}`;
    return comments.some(comment => {
        if (!githubUsersMatch(comment.user?.login ?? '', botLogin)) return false;
        const status = parsePublicationMarker(comment.body);
        if (status?.identity.topic === 'plan'
            && publicationTargetToken(status.identity.target) === expectedTarget) return true;
        const reply = parsePublicationReplyMarker(comment.body);
        if (reply?.target === expectedTarget
            && (reply.messageKey === 'direct-answer' || reply.messageKey === 'copilot-welcome')) return true;
        return comment.body?.includes(COPILOT_WELCOME_MARKER) === true;
    });
}

export function selectSemanticReplyIntents(context: SemanticPublicationContext): readonly SemanticReplyIntent[] {
    if (!context.target || !positiveInteger(context.target.number) || !context.correlationId?.trim()) return [];
    const correlationId = safeMarkerToken(context.correlationId);
    const replies = context.results.flatMap(result => {
        if (!result.success) return [];
        const payload = getResultPayload(result.payload);
        if (!payload) return [];
        const branchSync = branchSyncResultProjection(result.id, payload, context.correlationId);
        if (branchSync) return [replyIntent(context, correlationId, 'branch-sync-result', branchSync)];
        if (!result.executed) return [];
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
    });
    if (replies.length > 0) return Object.freeze([replies[0]]);
    if (!context.correlationId.startsWith('comment:')) return Object.freeze([]);
    const error = context.results.flatMap(result => result.errors).at(0);
    if (!error) return Object.freeze([]);
    const projection = Object.freeze({
        kind: 'application-error' as const,
        error: Object.freeze({
            code: error.code,
            retryable: error.retryable,
            correlationId: error.correlationId,
            ...(error.recovery ? { recovery: error.recovery } : {}),
        }),
    });
    return Object.freeze([replyIntent(context, correlationId, 'application-error', projection)]);
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
    const body = renderReplyBody(intent, catalog);
    return `${marker}\n\n${body}`;
}

function renderReplyBody(intent: SemanticReplyIntent, catalog: PublicationMessageCatalog): string {
    if (intent.projection.kind === 'direct-answer') return renderDirectAnswer(intent.projection, catalog);
    if (intent.projection.kind === 'help') {
        return buildCopilotHelpMessage(intent.projection.botLogin, intent.locale, catalog);
    }
    if (intent.projection.kind === 'welcome') {
        return buildCopilotWelcomeMessage(intent.projection.botLogin, intent.locale, catalog);
    }
    if (intent.projection.kind === 'access-policy') return renderAccessPolicyReply(catalog);
    if (intent.projection.kind === 'application-error') {
        const messages = intent.projection.error.code === 'locale.translation-failed'
            ? ENGLISH_PUBLICATION_CATALOG
            : catalog;
        return [
            `## ${messages.render('interaction.error.heading')}`,
            '',
            renderApplicationErrorMarkdown(intent.projection.error, messages.render),
        ].join('\n');
    }
    if (intent.projection.kind === 'branch-sync-result') {
        return renderBranchSyncResult(intent.projection, catalog);
    }
    return formatCopilotStatus(intent.projection.snapshot, intent.locale, catalog);
}

function renderBranchSyncResult(
    projection: Extract<SemanticReplyProjection, { readonly kind: 'branch-sync-result' }>,
    catalog: PublicationMessageCatalog,
): string {
    const values = {
        parentBranch: inlineRef(projection.parentBranch),
        workingBranch: inlineRef(projection.workingBranch),
    };
    if (projection.outcome === 'already-aligned') {
        return safeCatalogSentence(catalog.render('interaction.branchSync.alreadyAligned', values));
    }
    if (projection.outcome === 'dry-run-clean') {
        return safeCatalogSentence(catalog.render('interaction.branchSync.dryRunClean', values));
    }
    if (projection.outcome === 'dry-run-conflicted') {
        return safeCatalogSentence(catalog.render(
            'interaction.branchSync.dryRunConflicted',
            { ...values, count: projection.conflictCount },
        ));
    }
    const details = [
        safeCatalogSentence(catalog.render('interaction.branchSync.merged', {
            ...values,
            commitSha: inlineRef(projection.commitSha ?? 'unknown'),
        })),
        ...(projection.outcome === 'merged-with-agent' ? [
            safeCatalogSentence(catalog.render(
                'interaction.branchSync.agentResolution',
                { count: projection.conflictCount },
            )),
        ] : []),
        safeCatalogSentence(catalog.render(
            'interaction.branchSync.verification',
            { count: projection.verificationCount },
        )),
    ];
    return [`## ${safeCatalogSentence(catalog.render('interaction.branchSync.heading'))}`, '', ...details]
        .join('\n\n');
}

function renderDirectAnswer(
    projection: Extract<SemanticReplyProjection, { readonly kind: 'direct-answer' }>,
    catalog: PublicationMessageCatalog,
): string {
    const answer = sanitizeAgentMarkdown(projection.answer).trim();
    const translation = projection.translation
        ? renderTranslationContext(projection.translation, catalog)
        : '';
    return [answer, translation].filter(Boolean).join('\n\n');
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
    const translation = translationProjection(publication.translation);
    return Object.freeze({
        kind: 'direct-answer' as const,
        answer: publication.answer.trim(),
        ...(translation ? { translation } : {}),
    });
}

function branchSyncResultProjection(
    resultId: string,
    payload: Record<string, unknown>,
    correlationId: string | undefined,
): Extract<SemanticReplyProjection, { readonly kind: 'branch-sync-result' }> | undefined {
    const outcomes = [
        'already-aligned',
        'dry-run-clean',
        'dry-run-conflicted',
        'merged-cleanly',
        'merged-with-agent',
    ] as const;
    if (resultId !== 'SyncBranchUseCase'
        || !correlationId?.startsWith('comment:')
        || !outcomes.includes(payload.outcome as typeof outcomes[number])
        || typeof payload.parentBranch !== 'string'
        || !payload.parentBranch.trim()
        || typeof payload.workingBranch !== 'string'
        || !payload.workingBranch.trim()) return undefined;
    const commitSha = canonicalGitObjectId(payload.commitSha);
    const outcome = payload.outcome as typeof outcomes[number];
    if ((outcome === 'merged-cleanly' || outcome === 'merged-with-agent') && !commitSha) return undefined;
    const conflictPaths = Array.isArray(payload.conflictPaths) ? payload.conflictPaths : [];
    const verificationCount = positiveCount(payload.verificationCount);
    return Object.freeze({
        kind: 'branch-sync-result',
        outcome,
        parentBranch: payload.parentBranch.trim(),
        workingBranch: payload.workingBranch.trim(),
        conflictCount: conflictPaths.length,
        verificationCount,
        ...(commitSha ? { commitSha } : {}),
    });
}

function translationProjection(value: unknown): TranslationPublication | undefined {
    const translation = getResultPayload(value);
    if (!translation
        || typeof translation.translatedText !== 'string'
        || !translation.translatedText.trim()
        || typeof translation.originalText !== 'string'
        || !translation.originalText.trim()
        || typeof translation.sourceLocale !== 'string'
        || !translation.sourceLocale.trim()
        || typeof translation.targetLocale !== 'string'
        || !translation.targetLocale.trim()) return undefined;
    return Object.freeze({
        translatedText: translation.translatedText,
        originalText: translation.originalText,
        sourceLocale: translation.sourceLocale,
        targetLocale: translation.targetLocale,
    });
}

function progressIntent(id: string, payload: Record<string, unknown>, locale: string): SemanticStatusIntent | undefined {
    const sourceHeadSha = canonicalGitObjectId(payload.sourceHeadSha);
    const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
    if (id !== 'CheckProgressUseCase'
        || !positiveInteger(payload.issueNumber)
        || typeof payload.progress !== 'number'
        || typeof payload.summary !== 'string'
        || !sourceHeadSha
        || !branch) return undefined;
    const progress = Math.max(0, Math.min(100, Math.round(payload.progress)));
    const projection = Object.freeze<ProgressPublicationProjection>({
        kind: 'progress',
        progress,
        summary: payload.summary.trim() || 'Progress was assessed without a summary.',
        ...(typeof payload.remaining === 'string' && payload.remaining.trim()
            ? { remaining: payload.remaining.trim() }
            : {}),
        branch,
        ...(typeof payload.developmentBranch === 'string' && payload.developmentBranch.trim()
            ? { developmentBranch: payload.developmentBranch.trim() }
            : {}),
    });
    return Object.freeze({
        ...statusIntent('progress', payload.issueNumber, 'work', `head:${sourceHeadSha}`, locale, projection),
        sourceGuard: Object.freeze({ kind: 'branch-head', branch, sha: sourceHeadSha }),
    });
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

function positiveCount(value: unknown): number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function inlineRef(value: string): string {
    return `\`${value.replace(/[\r\n`<>]/gu, '').replace(/@/gu, '@\u200b').slice(0, 255)}\``;
}

function safeCatalogSentence(value: string): string {
    return sanitizeAgentMarkdown(value, 700).replace(/[\r\n]+/gu, ' ').trim();
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
