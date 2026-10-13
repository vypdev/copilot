import type { BoundReplyRequestReadPort } from '../../ports/reply_request_read_ports';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
import { Result } from '../../../data/model/result';
import { githubUsersMatch } from '../../../domain/github_user_policy';
import type { BoundIssueCompletionReadPort } from '../../ports/issue_completion_ports';
import type { BoundIssueCommentQueryPort, BoundIssueCommentUpdatePort } from '../../ports/issue_lifecycle_ports';
import { parsePublicationMarker } from '../../policies/publication_identity_policy';
import { buildRetiredProgressComment } from '../../policies/retired_progress_presentation_policy';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import type { ParamUseCase } from '../base/param_usecase';

export interface RetireProgressContext {
  readonly issueNumber: number;
  readonly locale: string;
  readonly trustedBotLogin?: string;
}

/** Retire existing owned status cards only; no create/delete, labels, Git or agent authority. */
export class RetireProgressUseCase implements ParamUseCase<RetireProgressContext, Result[]> {
  readonly taskId = 'RetireProgressUseCase';
  constructor(
    private readonly issues: BoundIssueCompletionReadPort,
    private readonly comments: BoundIssueCommentQueryPort & BoundIssueCommentUpdatePort,
    private readonly cardFreshness: BoundReplyRequestReadPort,
  ) {}

  async invoke(context: RetireProgressContext): Promise<Result[]> {
    let retired = 0;
    let nativeClosed = false;
    try {
      if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1 || !context.trustedBotLogin) {
        return [this.result(retired, nativeClosed)];
      }
      const initial = await this.issues.readIssue(context.issueNumber);
      if (initial.number !== context.issueNumber || !['open', 'closed'].includes(initial.state) || initial.state === 'closed' && !['completed', 'not_planned', 'duplicate', 'unknown'].includes(initial.reason)) throw stale();
      if (initial.state !== 'closed') return [this.result(retired, nativeClosed)];
      nativeClosed = true;
      const cards = (await this.comments.listIssueComments(context.issueNumber)).filter(comment => {
        const marker = parsePublicationMarker(comment.body);
        return marker?.identity.topic === 'progress' && marker.identity.target.kind === 'issue'
          && marker.identity.target.number === context.issueNumber && marker.identity.key === 'work'
          && buildRetiredProgressComment(comment.body ?? '', context.locale, initial.reason) !== undefined
          && Number.isSafeInteger(comment.id) && comment.id > 0
          && Boolean(comment.user?.login && githubUsersMatch(context.trustedBotLogin!, comment.user.login));
      });
      if (cards.length > 20) throw stale();
      for (const card of cards) {
        const body = buildRetiredProgressComment(card.body ?? '', context.locale, initial.reason)!;
        if (card.body === body) continue;
        const witness = Object.freeze({ surface: 'issue-comment' as const, commentId: card.id,
          author: context.trustedBotLogin, target: Object.freeze({ kind: 'issue' as const, number: context.issueNumber }),
          bodyDigest: replyRequestBodyDigest(card.body ?? '') });
        if (!await this.cardFreshness.matches(witness)) throw stale();
        const fresh = await this.issues.readIssue(context.issueNumber);
        nativeClosed = fresh.number === context.issueNumber && fresh.state === 'closed';
        if (!nativeClosed || fresh.reason !== initial.reason) throw stale();
        await this.comments.updateComment(context.issueNumber, card.id, body);
        retired++;
      }
      return [this.result(retired, nativeClosed)];
    } catch (cause) {
      return [new Result({ id: this.taskId, success: false, executed: retired > 0,
        steps: [nativeClosed ? 'Issue closure is retained; progress card retirement could not be fully verified. Retry the closed-issue event or merged-PR operation.' : 'Native issue closure could not be verified; progress cards were left unchanged.'],
        errors: [toApplicationError(cause, 'provider.unavailable', 'Unable to retire progress cards safely.')],
        payload: { nativeClosed, retiredCards: retired, reconciled: false } })];
    }
  }

  private result(retired: number, nativeClosed: boolean): Result {
    return new Result({ id: this.taskId, success: true, executed: retired > 0,
      steps: [retired ? 'The closed issue’s progress cards were retired.' : 'No progress card required retirement.'],
      payload: { ...(nativeClosed ? { state: 'closed' } : {}), nativeClosed, retiredCards: retired, reconciled: true } });
  }
}
function stale(): ApplicationError {
  return new ApplicationError('workflow.stale', 'The native issue state or owned progress card changed or is unavailable.');
}
