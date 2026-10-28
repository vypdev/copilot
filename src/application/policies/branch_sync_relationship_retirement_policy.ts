import type { BranchDependency } from '../ports/branch_sync_ports';
import type { IssueCommentPublicationTarget } from '../ports/issue_lifecycle_ports';
import { githubUsersMatch } from '../../domain/github_user_policy';
import { branchSyncPublicationIdentity } from './branch_sync_notification_policy';
import { parsePublicationMarker } from './publication_identity_policy';

/** Only verified bot-owned status cards for another pair on this exact issue. */
export function unrelatedBranchSyncCards(
  comments: readonly IssueCommentPublicationTarget[], current: BranchDependency, trustedBotLogin?: string,
): IssueCommentPublicationTarget[] {
  if (!trustedBotLogin) return [];
  const identity = branchSyncPublicationIdentity(current);
  return comments.filter(comment => {
    const marker = parsePublicationMarker(comment.body);
    return marker?.identity.topic === 'branch-sync' && marker.identity.target.kind === 'issue'
      && marker.identity.target.number === current.issueNumber && marker.identity.key !== identity.key
      && /^dependency:[a-f0-9]{16}$/u.test(marker.identity.key)
      && /^(?:(?:comparison|aligned|relationship-retired):[a-f0-9]{16}|closed:issue)$/u.test(marker.sourceVersion)
      && Number.isSafeInteger(comment.id) && comment.id > 0
      && Boolean(comment.user?.login && githubUsersMatch(trustedBotLogin, comment.user.login));
  });
}
