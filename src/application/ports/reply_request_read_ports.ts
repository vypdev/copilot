import type { PublicationTarget } from '../../domain/github_publication';

/** Exact event request witness; contains no prose, credentials or provider DTO. */
export interface ReplyRequestSnapshot {
    readonly surface: 'issue-comment' | 'review-comment';
    readonly commentId: number;
    readonly author: string;
    readonly bodyDigest: string;
    readonly target: PublicationTarget;
}
export interface BoundReplyRequestReadPort {
    matches(snapshot: ReplyRequestSnapshot): Promise<boolean>;
}
