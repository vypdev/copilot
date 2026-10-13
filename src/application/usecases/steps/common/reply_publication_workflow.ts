import type { BoundReplyRequestReadPort, ReplyRequestSnapshot } from '../../../ports/reply_request_read_ports';
import { publicationTargetToken } from '../../../../domain/github_publication';
import { githubUsersMatch } from '../../../../domain/github_user_policy';
import type { BoundIssueCommentPublicationPort, IssueCommentPublicationTarget } from '../../../ports/issue_lifecycle_ports';
import {
    buildDuplicateMarker,
    parsePublicationReplyMarker,
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
    readonly requestSource?: ReplyRequestSnapshot;
}

export interface ReplyPublicationOutcome {
    readonly effect: 'created' | 'updated' | 'unchanged';
    readonly canonicalCommentId?: number;
    readonly duplicatesRemoved: number;
    readonly duplicatesCompacted: number;
    readonly compactedCommentIds: readonly number[];
}

/** Publishes trusted correlated replies and refreshes verified read-only projections. */
export async function reconcileReply(
    context: ReplyPublicationContext,
    comments: BoundIssueCommentPublicationPort,
    requestRead?: BoundReplyRequestReadPort,
): Promise<ReplyPublicationOutcome> {
    if (!context.botLogin.trim()) return unchangedOutcome();
    const target = context.intent.target;
    const witness = context.requestSource ? Object.freeze({ ...context.requestSource,
        target: Object.freeze({ ...context.requestSource.target }) }) : undefined;
    const refreshable: Readonly<Record<string, string>> = {
        'application-error': 'application-error', 'copilot-status': 'status-command', 'copilot-help': 'help',
        'copilot-doctor': 'doctor-command', 'copilot-history': 'history-command', 'copilot-sdd-diff': 'sdd-diff',
    };
    const canRefresh = Boolean(witness && refreshable[context.intent.messageKey] === context.intent.projection.kind);
    const sourceMatches = async () => {
        if (!witness) return !context.intent.correlationId.startsWith('comment:');
        const correlation = witness.surface === 'review-comment' ? 'comment:pull_request_review_comment:' : 'comment:';
        return Boolean(requestRead && context.intent.correlationId === correlation + witness.commentId
            && witness.target.kind === target.kind && witness.target.number === target.number
            && await requestRead.matches(witness));
    };
    if (!await sourceMatches()) return unchangedOutcome();
    let owned = matchingReplies(await comments.listIssueComments(target.number), context);
    let effect: ReplyPublicationOutcome['effect'] = 'unchanged';
    if (owned.length === 0) {
        if (!await sourceMatches()) return unchangedOutcome();
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
    if (!await sourceMatches()) return Object.freeze({ ...unchangedOutcome(), effect, canonicalCommentId: canonical.id });
    if (canRefresh) {
        const rendered = renderSemanticReply(context.intent, context.catalog);
        if (canonical.body !== rendered) {
            if (!await sourceMatches()) return Object.freeze({ ...unchangedOutcome(), effect, canonicalCommentId: canonical.id });
            await comments.updateComment(target.number, canonical.id, rendered);
            effect = 'updated';
        }
    }
    let duplicatesRemoved = 0;
    let duplicatesCompacted = 0;
    const compactedCommentIds: number[] = [];
    for (const duplicate of duplicates) {
        if (!await sourceMatches()) break;
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
    return comments.filter(comment => {
        const marker = parsePublicationReplyMarker(comment.body);
        return marker?.target === expectedTarget
            && marker.correlationId === context.intent.correlationId
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
