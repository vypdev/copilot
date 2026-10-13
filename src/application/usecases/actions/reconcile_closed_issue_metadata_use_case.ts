import { Result } from '../../../data/model/result';
import { planIssueCompletion, type IssueCompletionLabelConfiguration } from '../../../domain/issue_completion';
import type { BoundIssueCompletionMetadataPort } from '../../ports/issue_completion_ports';
import { ApplicationError, toApplicationError } from '../../errors/application_error';
import type { ParamUseCase } from '../base/param_usecase';

export interface ClosedIssueMetadataContext {
    readonly issueNumber: number;
    readonly completionLabels: IssueCompletionLabelConfiguration;
}

/** Selective completion repair from fresh native facts; no native state authority. */
export class ReconcileClosedIssueMetadataUseCase implements ParamUseCase<ClosedIssueMetadataContext, Result[]> {
    readonly taskId = 'ReconcileClosedIssueMetadataUseCase';
    constructor(private readonly issues: BoundIssueCompletionMetadataPort) {}

    async invoke(context: ClosedIssueMetadataContext): Promise<Result[]> {
        let labelsChanged = 0;
        let nativeClosed = false;
        try {
            if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1) throw stale();
            const target = this.issues.forIssue(context.issueNumber);
            const initial = await target.read();
            nativeClosed = initial.number === context.issueNumber && initial.state === 'closed';
            const initialPlan = planIssueCompletion(initial, context.completionLabels);
            if (!nativeClosed || initialPlan.kind !== 'closed') throw stale();
            const fence = async () => {
                const current = await target.read();
                nativeClosed = current.number === context.issueNumber && current.state === 'closed';
                const plan = planIssueCompletion(current, context.completionLabels);
                if (!nativeClosed || plan.kind !== 'closed' || current.reason !== initial.reason) throw stale();
                return plan;
            };
            for (const label of initialPlan.remove) {
                if ((await fence()).remove.includes(label)) { await target.removeLabel(label); labelsChanged++; }
            }
            for (const label of initialPlan.add) {
                if ((await fence()).add.includes(label)) { await target.addLabel(label); labelsChanged++; }
            }
            const final = await fence();
            if (final.remove.length || final.add.length) throw stale();
            return [new Result({ id: this.taskId, success: true, executed: labelsChanged > 0,
                steps: ['The closed issue completion metadata was verified; historical and unrelated labels were retained.'],
                payload: { issueCompletion: { nativeClosed, labelsChanged, reconciled: true, reason: initial.reason } } })];
        } catch (cause) {
            return [new Result({ id: this.taskId, success: false, executed: labelsChanged > 0,
                steps: [nativeClosed ? 'The issue remains closed; completion metadata could not be fully verified. Inspect and retry the closed-issue workflow.'
                    : 'Current native issue closure could not be verified; completion repair stopped without changing native state.'],
                errors: [toApplicationError(cause, 'provider.unavailable', 'Closed issue completion metadata remains unverified.')],
                payload: { issueCompletion: { nativeClosed, labelsChanged, reconciled: false } } })];
        }
    }
}

function stale(): ApplicationError {
    return new ApplicationError('workflow.stale', 'The native closed issue identity, reason, or completion metadata changed or is unavailable.');
}
