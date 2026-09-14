import { publicationTargetToken } from '../../../../domain/github_publication';
import { githubUsersMatch } from '../../../../domain/github_user_policy';
import type { BoundIssueCommentPublicationPort, IssueCommentPublicationTarget } from '../../../ports/issue_lifecycle_ports';
import { buildDuplicateMarker, parsePublicationReplyMarker } from '../../../policies/publication_identity_policy';
import { resolveStaticPublicationCatalog } from '../../../policies/publication_message_catalog';
import { renderSemanticReply, type SemanticReplyIntent } from '../../../policies/semantic_result_publication_policy';

export interface ReplyPublicationContext {
    readonly owner: string;
    readonly repository: string;
    readonly botLogin: string;
    readonly intent: SemanticReplyIntent;
}

export interface ReplyPublicationOutcome {
    readonly effect: 'created' | 'unchanged';
    readonly canonicalCommentId?: number;
    readonly duplicatesCompacted: number;
}

/** Publishes an explicit reply at most once for a trusted request correlation. */
export async function reconcileReply(
    context: ReplyPublicationContext,
    comments: BoundIssueCommentPublicationPort,
): Promise<ReplyPublicationOutcome> {
    if (!context.botLogin.trim()) return Object.freeze({ effect: 'unchanged', duplicatesCompacted: 0 });
    const target = context.intent.target;
    let owned = matchingReplies(await comments.listIssueComments(target.number), context);
    let effect: ReplyPublicationOutcome['effect'] = 'unchanged';
    if (owned.length === 0) {
        await comments.addComment(target.number, renderSemanticReply(context.intent));
        effect = 'created';
        owned = matchingReplies(await comments.listIssueComments(target.number), context);
    }
    if (owned.length === 0) return Object.freeze({ effect, duplicatesCompacted: 0 });

    const [canonical, ...duplicates] = owned.sort((left, right) => left.id - right.id);
    for (const duplicate of duplicates) {
        await comments.updateComment(target.number, duplicate.id, duplicatePointer(context, canonical.id));
    }
    return Object.freeze({ effect, canonicalCommentId: canonical.id, duplicatesCompacted: duplicates.length });
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
    const messages = resolveStaticPublicationCatalog(context.intent.locale).catalog;
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
