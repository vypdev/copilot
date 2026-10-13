import { Result } from '../../../data/model/result';
import { githubUsersMatch } from '../../../domain/github_user_policy';
import type { BoundIssueCompletionReadPort } from '../../ports/issue_completion_ports';
import type { BoundIssueCommentQueryPort, BoundIssueCommentUpdatePort } from '../../ports/issue_lifecycle_ports';
import { parsePublicationMarker } from '../../policies/publication_identity_policy';
import { buildRetiredBranchSyncComment } from '../../policies/branch_sync_notification_policy';
import { resolveStaticBranchSyncCatalog } from '../../policies/branch_sync_message_catalog';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import type { ParamUseCase } from '../base/param_usecase';

export interface RetireBranchSyncContext {
  readonly issueNumber: number;
  readonly locale: string;
  readonly trustedBotLogin?: string;
}

/** Retire existing owned status cards only; no create/delete, labels, Git or agent authority. */
export class RetireBranchSyncUseCase implements ParamUseCase<RetireBranchSyncContext, Result[]> {
  readonly taskId = 'RetireBranchSyncUseCase';
  constructor(
    private readonly issues: BoundIssueCompletionReadPort,
    private readonly comments: BoundIssueCommentQueryPort & BoundIssueCommentUpdatePort,
  ) {}

  async invoke(context: RetireBranchSyncContext): Promise<Result[]> {
    let retired = 0;
    let nativeClosed = false;
    try {
      if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1 || !context.trustedBotLogin) {
        return [this.result(retired, nativeClosed)];
      }
      const initial = await this.issues.readIssue(context.issueNumber);
      if (initial.number !== context.issueNumber || !['open', 'closed'].includes(initial.state)) throw stale();
      if (initial.state !== 'closed') return [this.result(retired, nativeClosed)];
      nativeClosed = true;
      const messages = resolveStaticBranchSyncCatalog(context.locale);
      const cards = (await this.comments.listIssueComments(context.issueNumber)).filter(comment => {
        const marker = parsePublicationMarker(comment.body);
        return marker?.identity.topic === 'branch-sync' && marker.identity.target.kind === 'issue'
          && marker.identity.target.number === context.issueNumber && /^dependency:[a-f0-9]{16}$/u.test(marker.identity.key)
          && (marker.sourceVersion.startsWith('comparison:') || marker.sourceVersion.startsWith('aligned:') || marker.sourceVersion === 'closed:issue')
          && Number.isSafeInteger(comment.id) && comment.id > 0
          && Boolean(comment.user?.login && githubUsersMatch(context.trustedBotLogin!, comment.user.login));
      });
      if (cards.length > 20) throw stale();
      for (const card of cards) {
        const marker = parsePublicationMarker(card.body)!;
        const body = buildRetiredBranchSyncComment(marker.identity, messages);
        if (card.body === body) continue;
        const current = (await this.comments.listIssueComments(context.issueNumber)).find(comment => comment.id === card.id);
        if (current?.body !== card.body || !current.user?.login || !githubUsersMatch(context.trustedBotLogin, current.user.login)) throw stale();
        const fresh = await this.issues.readIssue(context.issueNumber);
        nativeClosed = fresh.number === context.issueNumber && fresh.state === 'closed';
        if (!nativeClosed || fresh.reason !== initial.reason) throw stale();
        await this.comments.updateComment(context.issueNumber, card.id, body);
        retired++;
      }
      return [this.result(retired, nativeClosed)];
    } catch (cause) {
      return [new Result({ id: this.taskId, success: false, executed: retired > 0,
        steps: [nativeClosed ? 'Issue closure is retained; synchronization recommendation retirement could not be fully verified. Retry the closed-issue event or merged-PR operation.' : 'Native issue closure could not be verified; synchronization recommendations were left unchanged.'],
        errors: [toApplicationError(cause, 'provider.unavailable', 'Unable to retire synchronization recommendations safely.')],
        payload: { nativeClosed, retiredCards: retired, reconciled: false } })];
    }
  }

  private result(retired: number, nativeClosed: boolean): Result {
    return new Result({ id: this.taskId, success: true, executed: retired > 0,
      steps: [retired ? 'The closed issue’s synchronization recommendations were retired.' : 'No synchronization recommendation required retirement.'],
      payload: { ...(nativeClosed ? { state: 'closed' } : {}), nativeClosed, retiredCards: retired, reconciled: true } });
  }
}
function stale(): ApplicationError {
  return new ApplicationError('workflow.stale', 'The native issue state or owned synchronization card changed or is unavailable.');
}
