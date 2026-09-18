import type { PublicationIdentity, TransitionPublicationIntent } from '../../../../domain/github_publication';
import { publicationIdentityEquals } from '../../../../domain/github_publication';
import { githubUsersMatch } from '../../../../domain/github_user_policy';
import type {
    BoundIssueCommentPublicationPort,
    IssueCommentPublicationTarget,
} from '../../../ports/issue_lifecycle_ports';
import {
    buildDuplicateMarker,
    buildPublicationTransitionMarker,
    parsePublicationTransitionMarker,
} from '../../../policies/publication_identity_policy';
import { cleanupDuplicateComment } from './duplicate_comment_cleanup_workflow';

export const MAX_TRANSITION_NOTIFICATION_CHARACTERS = 400;
export const MAX_TRANSITION_NOTIFICATION_LINKS = 2;

export interface TransitionNotificationContext {
    readonly owner: string;
    readonly repository: string;
    readonly botLogin: string;
    readonly intent: TransitionPublicationIntent;
    readonly message: string;
    readonly duplicatePointer: (canonicalCommentUrl: string) => string;
}

export interface TransitionNotificationOutcome {
    readonly effect: 'created' | 'unchanged';
    readonly canonicalCommentId?: number;
    readonly duplicatesRemoved: number;
    readonly duplicatesCompacted: number;
    readonly compactedCommentIds: readonly number[];
}

/** Creates one immutable action notification per exact transition fingerprint. */
export async function reconcileTransitionNotification(
    context: TransitionNotificationContext,
    comments: BoundIssueCommentPublicationPort,
): Promise<TransitionNotificationOutcome> {
    if (!context.botLogin.trim()) return unchangedOutcome();
    const target = context.intent.identity.target;
    const rendered = renderTransitionNotification(context.intent, context.message);
    let owned = ownedNotifications(
        await comments.listIssueComments(target.number),
        context.intent.identity,
        context.intent.fingerprint,
        context.botLogin,
    );
    let effect: TransitionNotificationOutcome['effect'] = 'unchanged';
    if (owned.length === 0) {
        await comments.addComment(target.number, rendered);
        effect = 'created';
        owned = ownedNotifications(
            await comments.listIssueComments(target.number),
            context.intent.identity,
            context.intent.fingerprint,
            context.botLogin,
        );
    }
    if (owned.length === 0) return outcome(effect);

    const [canonical, ...duplicates] = owned.sort((left, right) => left.id - right.id);
    let duplicatesRemoved = 0;
    let duplicatesCompacted = 0;
    const compactedCommentIds: number[] = [];
    for (const duplicate of duplicates) {
        const pointer = validateVisibleMessage(context.duplicatePointer(canonicalCommentUrl(context, canonical.id)));
        const cleanup = await cleanupDuplicateComment({
            issueNumber: target.number,
            duplicateCommentId: duplicate.id,
            compactBody: [buildDuplicateMarker(canonical.id), '', pointer].join('\n'),
        }, comments);
        if (cleanup === 'removed') duplicatesRemoved += 1;
        if (cleanup === 'compacted') {
            duplicatesCompacted += 1;
            compactedCommentIds.push(duplicate.id);
        }
    }
    return outcome(effect, canonical.id, duplicatesRemoved, duplicatesCompacted, compactedCommentIds);
}

function canonicalCommentUrl(context: TransitionNotificationContext, commentId: number): string {
    const target = context.intent.identity.target;
    const targetPath = target.kind === 'pull-request' ? 'pull' : 'issues';
    return `https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}/${targetPath}/${target.number}#issuecomment-${commentId}`;
}

export function renderTransitionNotification(intent: TransitionPublicationIntent, message: string): string {
    return [buildPublicationTransitionMarker(intent), '', validateVisibleMessage(message)].join('\n');
}

function validateVisibleMessage(message: string): string {
    const normalized = message.trim();
    if (!normalized) throw new Error('Transition notification message must not be empty.');
    if (normalized.length > MAX_TRANSITION_NOTIFICATION_CHARACTERS) {
        throw new Error('Transition notification message exceeds the character budget.');
    }
    const links = normalized.match(/\[[^\]]*\]\([^)]*\)/gu) ?? [];
    if (links.length > MAX_TRANSITION_NOTIFICATION_LINKS) {
        throw new Error('Transition notification message exceeds the link budget.');
    }
    if (normalized.includes('<!--')) {
        throw new Error('Transition notification message must not contain an HTML marker.');
    }
    return normalized;
}

function ownedNotifications(
    comments: readonly IssueCommentPublicationTarget[],
    identity: PublicationIdentity,
    fingerprint: string,
    botLogin: string,
): IssueCommentPublicationTarget[] {
    return comments.filter(comment => {
        const marker = parsePublicationTransitionMarker(comment.body);
        return marker !== undefined
            && publicationIdentityEquals(marker.identity, identity)
            && marker.fingerprint === fingerprint
            && githubUsersMatch(comment.user?.login ?? '', botLogin);
    });
}

function unchangedOutcome(): TransitionNotificationOutcome {
    return outcome('unchanged');
}

function outcome(
    effect: TransitionNotificationOutcome['effect'],
    canonicalCommentId?: number,
    duplicatesRemoved = 0,
    duplicatesCompacted = 0,
    compactedCommentIds: readonly number[] = [],
): TransitionNotificationOutcome {
    return Object.freeze({
        effect,
        ...(canonicalCommentId === undefined ? {} : { canonicalCommentId }),
        duplicatesRemoved,
        duplicatesCompacted,
        compactedCommentIds: Object.freeze([...compactedCommentIds]),
    });
}
