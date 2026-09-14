import type { PublicationIdentity } from '../../../../domain/github_publication';
import { publicationIdentityEquals } from '../../../../domain/github_publication';
import { githubUsersMatch } from '../../../../domain/github_user_policy';
import type { BoundIssueCommentPublicationPort, IssueCommentPublicationTarget } from '../../../ports/issue_lifecycle_ports';
import { buildDuplicateMarker, parsePublicationMarker } from '../../../policies/publication_identity_policy';
import { resolveStaticPublicationCatalog, type PublicationMessageCatalog } from '../../../policies/publication_message_catalog';
import { renderSemanticStatus, type SemanticStatusIntent } from '../../../policies/semantic_result_publication_policy';

export interface StatusCardPublicationContext {
    readonly owner: string;
    readonly repository: string;
    readonly botLogin: string;
    readonly intent: SemanticStatusIntent;
    readonly catalog?: PublicationMessageCatalog;
}

export interface StatusCardPublicationOutcome {
    readonly effect: 'created' | 'updated' | 'unchanged';
    readonly canonicalCommentId?: number;
    readonly duplicatesCompacted: number;
}

export async function reconcileStatusCard(
    context: StatusCardPublicationContext,
    comments: BoundIssueCommentPublicationPort,
): Promise<StatusCardPublicationOutcome> {
    if (!context.botLogin.trim()) return Object.freeze({ effect: 'unchanged', duplicatesCompacted: 0 });
    const target = context.intent.identity.target;
    const rendered = renderSemanticStatus(context.intent, context.catalog);
    let owned = ownedCards(await comments.listIssueComments(target.number), context.intent.identity, context.botLogin);
    let effect: StatusCardPublicationOutcome['effect'] = 'unchanged';
    if (owned.length === 0) {
        await comments.addComment(target.number, rendered);
        effect = 'created';
        owned = ownedCards(await comments.listIssueComments(target.number), context.intent.identity, context.botLogin);
    }
    if (owned.length === 0) return Object.freeze({ effect, duplicatesCompacted: 0 });

    const [canonical, ...duplicates] = owned.sort((left, right) => left.id - right.id);
    const canonicalMarker = parsePublicationMarker(canonical.body);
    if (canonicalMarker?.digest !== context.intent.digest) {
        await comments.updateComment(target.number, canonical.id, rendered);
        effect = effect === 'created' ? 'created' : 'updated';
    }
    for (const duplicate of duplicates) {
        await comments.updateComment(target.number, duplicate.id, duplicatePointer(context, canonical.id));
    }
    return Object.freeze({
        effect,
        canonicalCommentId: canonical.id,
        duplicatesCompacted: duplicates.length,
    });
}

function ownedCards(
    comments: readonly IssueCommentPublicationTarget[],
    identity: PublicationIdentity,
    botLogin: string,
): IssueCommentPublicationTarget[] {
    return comments.filter(comment => {
        const marker = parsePublicationMarker(comment.body);
        return marker !== undefined
            && publicationIdentityEquals(marker.identity, identity)
            && githubUsersMatch(comment.user?.login ?? '', botLogin);
    });
}

function duplicatePointer(context: StatusCardPublicationContext, canonicalCommentId: number): string {
    const messages = context.catalog ?? resolveStaticPublicationCatalog(context.intent.locale).catalog;
    const targetPath = context.intent.identity.target.kind === 'pull-request' ? 'pull' : 'issues';
    const url = `https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}/${targetPath}/${context.intent.identity.target.number}#issuecomment-${canonicalCommentId}`;
    return [
        buildDuplicateMarker(canonicalCommentId),
        '',
        messages.supersededStatus,
        '',
        `[${messages.viewCurrentStatus}](${url}).`,
    ].join('\n');
}
