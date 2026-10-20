import { verifyClosedIssueCardRetirement } from './verify_closed_issue_card_retirement';
import { closedIssueReconciliationError } from '../../errors/closed_issue_reconciliation_error';
import { CLOSED_ISSUE_REASONS, type ClosedIssueReconciliationFacts } from '../../../domain/closed_issue_reconciliation';
import type { BoundReplyRequestReadPort } from '../../ports/reply_request_read_ports';
import { Result } from '../../../data/model/result';
import { githubUsersMatch } from '../../../domain/github_user_policy';
import type { BoundIssueCompletionReadPort } from '../../ports/issue_completion_ports';
import type { BoundIssueCommentQueryPort, BoundIssueCommentUpdatePort } from '../../ports/issue_lifecycle_ports';
import { parsePublicationMarker } from '../../policies/publication_identity_policy';
import { buildRetiredProgressComment } from '../../policies/retired_progress_presentation_policy';
import { ApplicationError } from '../../errors/application_error';
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
    let phase: ClosedIssueReconciliationFacts['phase'] = 'identity';
    let state: ClosedIssueReconciliationFacts['state'] = 'unavailable';
    let reason: ClosedIssueReconciliationFacts['reason'] = 'unavailable';
    let remaining = 0;
    let superseded = false;
    try {
      if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1 || !context.trustedBotLogin) {
        return [this.result(retired, nativeClosed)];
      }
      const read = async () => {
        state = 'unavailable'; reason = 'unavailable';
        const facts = await this.issues.readIssue(context.issueNumber);
        nativeClosed = facts?.number === context.issueNumber && facts.state === 'closed';
        state = facts?.number === context.issueNumber && ['open', 'closed'].includes(facts.state) ? facts.state : 'unavailable';
        reason = CLOSED_ISSUE_REASONS.some(value => value === facts?.reason) ? facts.reason : 'unavailable';
        return facts;
      };
      phase = 'read';
      const initial = await read();
      if (initial.number !== context.issueNumber || !['open', 'closed'].includes(initial.state) || initial.state === 'closed' && !['completed', 'not_planned', 'duplicate', 'unknown'].includes(initial.reason)) throw stale();
      if (initial.state !== 'closed') return [this.result(retired, nativeClosed)];
      nativeClosed = true;
      phase = 'card-inventory';
      const cards = (await this.comments.listIssueComments(context.issueNumber)).filter(comment => {
        const marker = parsePublicationMarker(comment.body);
        return marker?.identity.topic === 'progress' && marker.identity.target.kind === 'issue'
          && marker.identity.target.number === context.issueNumber && marker.identity.key === 'work'
          && buildRetiredProgressComment(comment.body ?? '', context.locale, initial.reason) !== undefined
          && Number.isSafeInteger(comment.id) && comment.id > 0
          && Boolean(comment.user?.login && githubUsersMatch(context.trustedBotLogin!, comment.user.login));
      });
      remaining = Math.min(cards.length, 3_000);
      if (cards.length > 20) throw stale();
      const verifyClosed = async () => {
        phase = 'native-fence';
        const fresh = await read();
        if (!nativeClosed || fresh.reason !== initial.reason) throw stale();
      };
      for (const card of cards) {
        const body = buildRetiredProgressComment(card.body ?? '', context.locale, initial.reason)!;
        const verified = await verifyClosedIssueCardRetirement({ issueNumber: context.issueNumber,
          commentId: card.id, author: context.trustedBotLogin, originalBody: card.body ?? '', finalBody: body,
          freshness: this.cardFreshness, verifyClosed, onUpdated: () => { retired++; }, phase: value => { phase = value; },
          update: () => this.comments.updateComment(context.issueNumber, card.id, body) });
        superseded ||= verified.superseded;
        remaining--;
      }
      await verifyClosed();
      return [this.result(retired, nativeClosed, superseded)];
    } catch (cause) {
      return [new Result({ id: this.taskId, success: false, executed: retired > 0,
        steps: [nativeClosed ? 'Issue closure is retained; progress card retirement could not be fully verified. Retry the closed-issue event or merged-PR operation.' : 'Native issue closure could not be verified; progress cards were left unchanged.'],
        errors: [closedIssueReconciliationError(cause, { resultId: this.taskId, phase, state, reason, changed: retired, remaining })],
        payload: { nativeClosed, retiredCards: retired, reconciled: false } })];
    }
  }

  private result(retired: number, nativeClosed: boolean, superseded = false): Result {
    return new Result({ id: this.taskId, success: true, executed: retired > 0,
      steps: [retired ? 'The closed issue’s progress cards were retired.' : 'No progress card required retirement.'],
      payload: { ...(nativeClosed ? { state: 'closed' } : {}), nativeClosed, retiredCards: retired, reconciled: true, superseded,
        outcome: nativeClosed ? retired ? 'reconciled' : 'already-converged' : 'not-applicable' } });
  }
}
function stale(): ApplicationError {
  return new ApplicationError('workflow.stale', 'The native issue state or owned progress card changed or is unavailable.');
}
