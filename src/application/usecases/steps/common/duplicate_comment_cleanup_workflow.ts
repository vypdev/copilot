import type { BoundIssueCommentPublicationPort } from '../../../ports/issue_lifecycle_ports';

export type DuplicateCommentCleanupOutcome = 'removed' | 'compacted' | 'stale';

export interface DuplicateCommentCleanupContext {
    readonly issueNumber: number;
    readonly duplicateCommentId: number;
    readonly compactBody: string;
}

/** Removes an exact owned duplicate, retaining a compact pointer only when deletion is forbidden. */
export async function cleanupDuplicateComment(
    context: DuplicateCommentCleanupContext,
    comments: Pick<BoundIssueCommentPublicationPort, 'removeComment' | 'updateComment'>,
    sourceIsCurrent?: () => Promise<boolean>,
): Promise<DuplicateCommentCleanupOutcome> {
    if (sourceIsCurrent && !await sourceIsCurrent()) return 'stale';
    const removal = await comments.removeComment(context.issueNumber, context.duplicateCommentId);
    if (removal === 'removed') return 'removed';
    if (sourceIsCurrent && !await sourceIsCurrent()) return 'stale';
    await comments.updateComment(context.issueNumber, context.duplicateCommentId, context.compactBody);
    return 'compacted';
}
