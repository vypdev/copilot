import { Result } from '../../../../data/model/result';
import type { BoundIssueCompletionPort, IssueCompletionTargetPort } from '../../../ports/issue_completion_ports';
import { planIssueCompletion, type NativeIssueCompletionFacts, type IssueCompletionLabelConfiguration } from '../../../../domain/issue_completion';
import { ApplicationError, toApplicationError } from '../../../errors/application_error';
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
        let labelsChanged = 0;
        try {
            const pull = await this.issues.readPullRequest(pullNumber);
            if (pull.number !== pullNumber || pull.state !== 'closed' || pull.merged !== true) throw stale();
            const target = this.issues.forIssue(number);
            const read = async () => {
                const current = await this.read(target, number, param.completionLabels);
                nativeClosed = current.state === 'closed';
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
            const fence = async () => {
                const freshFacts = await read();
                const freshPlan = planIssueCompletion(freshFacts, param.completionLabels);
                if (freshPlan.kind !== 'closed' || freshFacts.reason !== facts.reason) throw stale();
                return freshPlan;
            };
            const plan = planIssueCompletion(facts, param.completionLabels);
            if (plan.kind !== 'closed') throw stale();
            for (const label of plan.remove) {
                const fresh = await fence();
                if (fresh.remove.includes(label)) { await target.removeLabel(label); labelsChanged++; }
            }
            for (const label of plan.add) {
                const fresh = await fence();
                if (fresh.add.includes(label)) { await target.addLabel(label); labelsChanged++; }
            }
            const final = await fence();
            if (final.remove.length || final.add.length) throw stale();
            return [new Result({ id: this.taskId, success: true, executed: closedThisRun || labelsChanged > 0,
                steps: [`Issue #${number} is closed and its completion metadata was verified after PR #${pullNumber} merged.`],
                payload: { issueCompletion: Object.freeze({ number, nativeClosed, closedThisRun, labelsChanged, reason: facts.reason, reconciled: true }) } })];
        } catch (error) {
            const semanticError = toApplicationError(error, 'provider.unavailable', nativeClosed
                ? 'The issue is closed, but completion metadata could not be fully verified. Retry the verified merged-PR operation.'
                : 'Native issue completion could not be verified. Inspect the linked run before retrying.');
            return [new Result({ id: this.taskId, success: false, executed: closedThisRun || labelsChanged > 0,
                steps: [nativeClosed ? 'The native issue closure was retained; completion metadata remains unverified.' : 'Native issue completion remains unverified.'],
                errors: [semanticError], payload: { issueCompletion: Object.freeze({ number, nativeClosed, closedThisRun, labelsChanged, reconciled: false }) } })];
        }
    }
    private async read(target: IssueCompletionTargetPort, number: number, configuration: IssueCompletionLabelConfiguration): Promise<NativeIssueCompletionFacts> {
        const facts = await target.read();
        if (facts.number !== number || planIssueCompletion(facts, configuration).kind === 'invalid') throw stale();
        return facts;
    }

}
function stale(): ApplicationError {
    return new ApplicationError('workflow.stale', 'The verified native issue or merged pull-request state changed or is unavailable.');
}
