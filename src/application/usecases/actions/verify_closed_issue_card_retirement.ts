import type { BoundReplyRequestReadPort, ReplyRequestSnapshot } from '../../ports/reply_request_read_ports';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
import { ApplicationError } from '../../errors/application_error';
import type { ClosedIssueReconciliationFacts } from '../../../domain/closed_issue_reconciliation';

/** Adopt another invocation only after the exact final owned body and native closure are fresh. */
export async function verifyClosedIssueCardRetirement(input: {
    readonly issueNumber: number; readonly commentId: number; readonly author: string;
    readonly originalBody: string; readonly finalBody: string;
    readonly freshness: BoundReplyRequestReadPort;
    readonly update: () => Promise<void>; readonly onUpdated: () => void; readonly verifyClosed: () => Promise<void>;
    readonly phase: (phase: ClosedIssueReconciliationFacts['phase']) => void;
}): Promise<{ updated: boolean; superseded: boolean }> {
    const witness = (body: string): ReplyRequestSnapshot => Object.freeze({ surface: 'issue-comment' as const,
        commentId: input.commentId, author: input.author,
        target: Object.freeze({ kind: 'issue' as const, number: input.issueNumber }), bodyDigest: replyRequestBodyDigest(body) });
    let updated = false;
    let failedWrite: unknown;
    if (input.originalBody !== input.finalBody) {
        input.phase('card-freshness');
        if (await input.freshness.matches(witness(input.originalBody))) {
            await input.verifyClosed();
            input.phase('card-update');
            try { await input.update(); updated = true; input.onUpdated(); } catch (cause) { failedWrite = cause; }
        }
    }
    input.phase('card-verification');
    if (!await input.freshness.matches(witness(input.finalBody))) {
        throw failedWrite ?? new ApplicationError('workflow.stale', 'The required final owned card could not be verified.');
    }
    await input.verifyClosed();
    return { updated, superseded: !updated && input.originalBody !== input.finalBody };
}
