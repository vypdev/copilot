import { publicationTargetToken } from '../../../../domain/github_publication';
import { githubUsersMatch } from '../../../../domain/github_user_policy';
import type { BoundIssueCommentPublicationPort, IssueCommentPublicationTarget } from '../../../ports/issue_lifecycle_ports';
import {
    buildDuplicateMarker,
    parsePublicationReplyMarker,
    readablePublicationReplyCorrelationIds,
} from '../../../policies/publication_identity_policy';
import { resolveStaticPublicationCatalog, type PublicationMessageCatalog } from '../../../policies/publication_message_catalog';
import { renderSemanticReply, type SemanticReplyIntent } from '../../../policies/semantic_result_publication_policy';
import { cleanupDuplicateComment } from './duplicate_comment_cleanup_workflow';

export interface ReplyPublicationContext {
    readonly owner: string;
    readonly repository: string;
    readonly botLogin: string;
    readonly intent: SemanticReplyIntent;
    readonly catalog?: PublicationMessageCatalog;
}

export interface ReplyPublicationOutcome {
    readonly effect: 'created' | 'unchanged';
    readonly canonicalCommentId?: number;
    readonly duplicatesRemoved: number;
    readonly duplicatesCompacted: number;
    readonly compactedCommentIds: readonly number[];
}

/** Publishes an explicit reply at most once for a trusted request correlation. */
export async function reconcileReply(
    context: ReplyPublicationContext,
    comments: BoundIssueCommentPublicationPort,
): Promise<ReplyPublicationOutcome> {
    if (!context.botLogin.trim()) return unchangedOutcome();
    const target = context.intent.target;
    let owned = matchingReplies(await comments.listIssueComments(target.number), context);
    let effect: ReplyPublicationOutcome['effect'] = 'unchanged';
    if (owned.length === 0) {
        await comments.addComment(target.number, renderSemanticReply(context.intent, context.catalog));
        effect = 'created';
        owned = matchingReplies(await comments.listIssueComments(target.number), context);
    }
    if (owned.length === 0) {
        return Object.freeze({
            effect, duplicatesRemoved: 0, duplicatesCompacted: 0, compactedCommentIds: Object.freeze([]),
        });
    }

    const [canonical, ...duplicates] = owned.sort((left, right) => left.id - right.id);
    let duplicatesRemoved = 0;
    let duplicatesCompacted = 0;
    const compactedCommentIds: number[] = [];
    for (const duplicate of duplicates) {
        const cleanup = await cleanupDuplicateComment({
            issueNumber: target.number,
            duplicateCommentId: duplicate.id,
            compactBody: duplicatePointer(context, canonical.id),
        }, comments);
        if (cleanup === 'removed') duplicatesRemoved += 1;
        else {
            duplicatesCompacted += 1;
            compactedCommentIds.push(duplicate.id);
        }
    }
    return Object.freeze({
        effect,
        canonicalCommentId: canonical.id,
        duplicatesRemoved,
        duplicatesCompacted,
        compactedCommentIds: Object.freeze(compactedCommentIds),
    });
}

function unchangedOutcome(): ReplyPublicationOutcome {
    return Object.freeze({
        effect: 'unchanged', duplicatesRemoved: 0, duplicatesCompacted: 0,
        compactedCommentIds: Object.freeze([]),
    });
}

function matchingReplies(
    comments: readonly IssueCommentPublicationTarget[],
    context: ReplyPublicationContext,
): IssueCommentPublicationTarget[] {
    const expectedTarget = publicationTargetToken(context.intent.target);
    const readableCorrelations = new Set(
        readablePublicationReplyCorrelationIds(context.intent.correlationId),
    );
    return comments.filter(comment => {
        const marker = parsePublicationReplyMarker(comment.body);
        return marker?.target === expectedTarget
            && readableCorrelations.has(marker.correlationId)
            && marker.messageKey === context.intent.messageKey
            && githubUsersMatch(comment.user?.login ?? '', context.botLogin);
    });
}

function duplicatePointer(context: ReplyPublicationContext, canonicalCommentId: number): string {
    const messages = context.catalog ?? resolveStaticPublicationCatalog(context.intent.locale).catalog;
    const targetPath = context.intent.target.kind === 'pull-request' ? 'pull' : 'issues';
    const url = `https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}/${targetPath}/${context.intent.target.number}#issuecomment-${canonicalCommentId}`;
    return [
        buildDuplicateMarker(canonicalCommentId),
        '',
        messages.duplicateReply,
        '',
        `[${messages.viewOriginalResponse}](${url}).`,
    ].join('\n');
}
