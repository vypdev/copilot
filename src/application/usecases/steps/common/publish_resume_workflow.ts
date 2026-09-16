import { Result } from '../../../../data/model/result';
import type { BoundIssueCommentPublicationPort } from '../../../ports/issue_lifecycle_ports';
import { logError, logInfo } from '../../../ports/logging_ports';
import { selectSemanticReplyIntents, selectSemanticStatusIntents } from '../../../policies/semantic_result_publication_policy';
import type { PublicationTarget } from '../../../../domain/github_publication';
import { toApplicationError } from '../../../errors/application_error';
import { createSemanticDigest } from '../../../policies/publication_identity_policy';
import { reconcileReply } from './reply_publication_workflow';
import { reconcileStatusCard } from './status_card_publication_workflow';
import type { AgentConfiguration } from '../../../../domain/agent';
import type { MessageCatalogResolutionPort } from '../../../ports/message_catalog_ports';
import { resolvePublicationCatalog } from '../../../policies/publication_message_catalog';
import type { BoundPublicationSourceQueryPort } from '../../../ports/publication_freshness_ports';
import {
    buildDuplicateCompactionPublicationPayload,
    buildStaleSourcePublicationPayload,
} from '../../../policies/publication_outcome_policy';

export interface PublishResultContext {
    readonly owner: string;
    readonly repository: string;
    readonly botLogin: string;
    readonly locale: string;
    readonly target?: PublicationTarget;
    readonly requestCorrelationId: string;
    readonly results: readonly Result[];
    readonly languageConfiguration?: Readonly<AgentConfiguration>;
}

export interface PublishResultContextSource {
    readonly owner: string;
    readonly repo: string;
    readonly tokenUser?: string;
    readonly eventName?: string;
    readonly isPullRequest: boolean;
    readonly issueNumber?: number;
    readonly issue?: { readonly number?: number };
    readonly pullRequest?: { readonly number?: number };
    readonly inputs?: {
        readonly action?: string;
        readonly comment?: { readonly id?: number };
        readonly pull_request_review_comment?: { readonly id?: number };
    };
    readonly locale: { readonly issue: string; readonly pullRequest: string };
    readonly currentConfiguration: { readonly results: readonly Result[] };
    readonly ai?: { getAgentConfiguration(task: 'planner'): AgentConfiguration };
}

export function projectPublishResultContext(source: PublishResultContextSource): PublishResultContext {
    const target = publicationTarget(source);
    return Object.freeze({
        owner: source.owner,
        repository: source.repo,
        botLogin: source.tokenUser?.trim() ?? '',
        locale: source.isPullRequest ? source.locale.pullRequest : source.locale.issue,
        ...(target ? { target } : {}),
        requestCorrelationId: requestCorrelationId(source, target),
        results: Object.freeze(source.currentConfiguration.results.map(copyResult)),
        ...(source.ai ? { languageConfiguration: Object.freeze({ ...source.ai.getAgentConfiguration('planner') }) } : {}),
    });
}

/**
 * Semantic publication boundary. Only explicitly mapped payloads may reach
 * GitHub; steps, reminders, errors, and debug logs remain operator
 * evidence in the Job Summary and logs.
 */
export async function runPublishResume(
    param: PublishResultContext,
    taskId: string,
    comments: BoundIssueCommentPublicationPort,
    catalogResolver?: MessageCatalogResolutionPort,
    sourceQuery?: BoundPublicationSourceQueryPort,
): Promise<Result | undefined> {
    try {
        const semanticContext = {
            locale: param.locale,
            results: param.results,
            ...(param.target ? { target: param.target } : {}),
            correlationId: param.requestCorrelationId,
            botLogin: param.botLogin,
        };
        const replies = selectSemanticReplyIntents(semanticContext);
        const statuses = selectSemanticStatusIntents(semanticContext);
        if (replies.length === 0 && statuses.length === 0) {
            logInfo('Conversation publication omitted: no explicit semantic publication intent.');
            return undefined;
        }
        if (!param.botLogin) {
            logInfo('Conversation publication omitted: the configured bot identity is unavailable.');
            return undefined;
        }
        const catalog = await resolvePublicationCatalog(
            param.locale,
            param.languageConfiguration,
            catalogResolver,
        );
        let staleSourceEvidence: Readonly<{ branch: string; sha: string }> | undefined;
        const compactedCommentIds: number[] = [];
        for (const intent of replies) {
            const outcome = await reconcileReply({
                owner: param.owner,
                repository: param.repository,
                botLogin: param.botLogin,
                intent,
                catalog,
            }, comments);
            logInfo(
                `Semantic ${intent.messageKey} reply ${outcome.effect}; `
                + `duplicates removed=${outcome.duplicatesRemoved}; compacted=${outcome.duplicatesCompacted}.`,
            );
            compactedCommentIds.push(...outcome.compactedCommentIds);
        }
        for (const intent of statuses) {
            const outcome = await reconcileStatusCard({
                owner: param.owner,
                repository: param.repository,
                botLogin: param.botLogin,
                intent,
                catalog,
            }, comments, sourceQuery);
            logInfo(
                `Semantic ${intent.identity.topic} publication ${outcome.effect}; `
                + `reason=${outcome.reason ?? 'current'}; duplicates removed=${outcome.duplicatesRemoved}; `
                + `compacted=${outcome.duplicatesCompacted}.`,
            );
            if (outcome.reason === 'stale-source') {
                const sourceGuard = intent.sourceGuard;
                if (!sourceGuard) {
                    throw new Error('Stale-source publication outcome requires a source guard.');
                }
                staleSourceEvidence ??= Object.freeze({ branch: sourceGuard.branch, sha: sourceGuard.sha });
            }
            compactedCommentIds.push(...outcome.compactedCommentIds);
        }
        const cleanupEvidence = buildDuplicateCompactionPublicationPayload(compactedCommentIds);
        if (!staleSourceEvidence && !cleanupEvidence) return undefined;
        return new Result({
            id: taskId,
            success: true,
            executed: cleanupEvidence !== undefined,
            payload: Object.freeze({
                ...(staleSourceEvidence
                    ? buildStaleSourcePublicationPayload(staleSourceEvidence.branch, staleSourceEvidence.sha)
                    : {}),
                ...(cleanupEvidence ?? {}),
            }),
        });
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to publish semantic GitHub status.');
        logError(semanticError);
        return new Result({ id: taskId, success: false, executed: true, errors: [semanticError] });
    }
}

function publicationTarget(source: PublishResultContextSource): PublicationTarget | undefined {
    const pullRequestNumber = source.pullRequest?.number;
    if (source.isPullRequest && positiveInteger(pullRequestNumber)) {
        return Object.freeze({ kind: 'pull-request', number: pullRequestNumber });
    }
    const issueNumber = source.issue?.number ?? source.issueNumber;
    return positiveInteger(issueNumber) ? Object.freeze({ kind: 'issue', number: issueNumber }) : undefined;
}

function requestCorrelationId(source: PublishResultContextSource, target: PublicationTarget | undefined): string {
    const reviewCommentId = source.inputs?.pull_request_review_comment?.id;
    if (positiveInteger(reviewCommentId)) {
        return `comment:pull_request_review_comment:${reviewCommentId}`;
    }
    const issueCommentId = source.inputs?.comment?.id;
    if (positiveInteger(issueCommentId)) {
        return `comment:${issueCommentId}`;
    }
    return `event:${createSemanticDigest({
        eventName: source.eventName ?? 'unknown',
        action: source.inputs?.action ?? '',
        target: target ?? null,
    })}`;
}

function positiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function copyResult(result: Result): Result {
    return Object.freeze(new Result({
        id: result.id,
        success: result.success,
        executed: result.executed,
        steps: [...result.steps],
        payload: copyPayload(result.payload),
        reminders: [...result.reminders],
        errors: [...result.errors],
        stepFormat: result.stepFormat,
    }));
}

function copyPayload(payload: unknown): unknown {
    if (Array.isArray(payload)) return Object.freeze(payload.map(copyPayload));
    if (payload && typeof payload === 'object') {
        return Object.freeze(Object.fromEntries(
            Object.entries(payload as Record<string, unknown>).map(([key, value]) => [key, copyPayload(value)]),
        ));
    }
    return payload;
}
