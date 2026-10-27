import type { BranchDependency } from '../../ports/branch_sync_ports';
import type { IssueCommentPublicationTarget, BoundIssueCommentUpdatePort } from '../../ports/issue_lifecycle_ports';
import type { BoundReplyRequestReadPort, ReplyRequestSnapshot } from '../../ports/reply_request_read_ports';
import type { BranchSyncMessageCatalog } from '../../policies/branch_sync_message_catalog';
import { unrelatedBranchSyncCards } from '../../policies/branch_sync_relationship_retirement_policy';
import { buildUnrelatedBranchSyncComment } from '../../policies/branch_sync_notification_policy';
import { parsePublicationMarker } from '../../policies/publication_identity_policy';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
import { ApplicationError } from '../../errors/application_error';

/** Bounded in-place repair; no create/delete, command, Git, label or agent capability. */
export async function retireUnrelatedBranchSyncCards(input: {
  comments: readonly IssueCommentPublicationTarget[]; current: BranchDependency; botLogin?: string;
  messages: BranchSyncMessageCatalog; freshness?: BoundReplyRequestReadPort;
  updates: BoundIssueCommentUpdatePort; assertCurrent: () => Promise<void>; onUpdated: () => void;
}): Promise<void> {
  const cards = unrelatedBranchSyncCards(input.comments, input.current, input.botLogin);
  if (!cards.length) return;
  if (cards.length > 20 || !input.freshness) throw stale();
  const freshness = input.freshness;
  for (const card of cards) {
    const finalBody = buildUnrelatedBranchSyncComment(parsePublicationMarker(card.body)!.identity, input.current, input.messages);
    const witness = (body: string): ReplyRequestSnapshot => ({ surface: 'issue-comment', commentId: card.id,
      author: input.botLogin!, target: { kind: 'issue', number: input.current.issueNumber }, bodyDigest: replyRequestBodyDigest(body) });
    let failedWrite: unknown;
    if (card.body !== finalBody && await freshness.matches(witness(card.body!))) {
      await input.assertCurrent();
      try {
        await input.updates.updateComment(input.current.issueNumber, card.id, finalBody);
        input.onUpdated();
      } catch (cause) { failedWrite = cause; }
    }
    if (!await freshness.matches(witness(finalBody))) throw failedWrite ?? stale();
    await input.assertCurrent();
  }
}
function stale(): ApplicationError {
  return new ApplicationError('workflow.stale', 'The current issue relationship or owned historical advisory could not be verified.');
}
