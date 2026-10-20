import { completionRepairProgress, reconcileIssueCompletionMetadata } from '../../actions/reconcile_issue_completion_metadata';
import { closedIssueReconciliationError } from '../../../errors/closed_issue_reconciliation_error';
import { Result } from '../../../../data/model/result';
import type { BoundIssueCompletionPort } from '../../../ports/issue_completion_ports';
import { planIssueCompletion } from '../../../../domain/issue_completion';
import { ApplicationError } from '../../../errors/application_error';
import type { CloseIssueAfterMergeContext } from '../../issue_workflow_context';
import { parsePositiveSafeInteger } from '../../../../domain/positive_integer_policy';
import type { ParamUseCase } from '../../base/param_usecase';

/** Native completion first, selective metadata second; retained effects survive partial failures. */
export class CloseIssueAfterMergingUseCase implements ParamUseCase<CloseIssueAfterMergeContext, Result[]> {
    readonly taskId = 'CloseIssueAfterMergingUseCase';
    constructor(private readonly issues: BoundIssueCompletionPort) {}

    async invoke(param: CloseIssueAfterMergeContext): Promise<Result[]> {
        const number = parsePositiveSafeInteger(param.issueNumber);
        const pullNumber = parsePositiveSafeInteger(param.pullRequestNumber);
        if (!number || !pullNumber || number === pullNumber) return [new Result({ id: this.taskId, success: true, executed: false,
            steps: ['No separate safe linked issue and pull request were found; issue closure was skipped.'] })];
        let closedThisRun = false;
        let nativeClosed = false;
        const progress = completionRepairProgress();
        try {
            const pull = await this.issues.readPullRequest(pullNumber);
            if (pull.number !== pullNumber || pull.state !== 'closed' || pull.merged !== true) throw stale();
            const target = this.issues.forIssue(number);
            const read = async () => {
                const current = await target.read();
                if (current.number === number && ['open', 'closed'].includes(current.state)) nativeClosed = current.state === 'closed';
                if (current.number !== number || planIssueCompletion(current, param.completionLabels).kind === 'invalid') throw stale();
                return current;
            };
            let facts = await read();
            if (facts.state === 'open' && facts.reason === 'reopened') throw stale();
            if (facts.state === 'open') {
                closedThisRun = await target.close();
                facts = await read();
            }
            nativeClosed = facts.state === 'closed';
            if (!nativeClosed || closedThisRun && facts.reason !== 'completed') throw stale();
            const repaired = await reconcileIssueCompletionMetadata(target, number, param.completionLabels, progress, facts);
            nativeClosed = progress.nativeClosed;
            return [new Result({ id: this.taskId, success: true, executed: closedThisRun || progress.labelsChanged > 0,
                steps: [`Issue #${number} is closed and its completion metadata was verified after PR #${pullNumber} merged.`],
                payload: { issueCompletion: Object.freeze({ number, nativeClosed, closedThisRun, labelsChanged: progress.labelsChanged, ...repaired, reconciled: true }) } })];
        } catch (error) {
            if (progress.phase !== 'identity') nativeClosed = progress.nativeClosed;
            const semanticError = closedIssueReconciliationError(error, { resultId: this.taskId,
                phase: progress.phase, state: progress.state, reason: progress.reason,
                changed: progress.labelsChanged, remaining: progress.remaining });
            return [new Result({ id: this.taskId, success: false, executed: closedThisRun || progress.labelsChanged > 0,
                steps: [nativeClosed ? 'The native issue closure was retained; completion metadata remains unverified.' : 'Native issue completion remains unverified.'],
                errors: [semanticError], payload: { issueCompletion: Object.freeze({ number, nativeClosed, closedThisRun, labelsChanged: progress.labelsChanged, reconciled: false }) } })];
        }
    }

}
function stale(): ApplicationError {
    return new ApplicationError('workflow.stale', 'The verified native issue or merged pull-request state changed or is unavailable.');
}
