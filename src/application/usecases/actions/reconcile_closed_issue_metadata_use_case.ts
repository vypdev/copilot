import { Result } from '../../../data/model/result';
import { planIssueCompletion, type IssueCompletionLabelConfiguration } from '../../../domain/issue_completion';
import { deferredDeploymentCompletionResult } from './deferred_deployment_completion';
import type { BoundIssueCompletionMetadataPort } from '../../ports/issue_completion_ports';
import { ApplicationError } from '../../errors/application_error';
import { closedIssueReconciliationError } from '../../errors/closed_issue_reconciliation_error';
import { completionRepairProgress, reconcileIssueCompletionMetadata } from './reconcile_issue_completion_metadata';
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
        const progress = completionRepairProgress();
        try {
            if (!Number.isSafeInteger(context.issueNumber) || context.issueNumber < 1) throw stale();
            const target = this.issues.forIssue(context.issueNumber);
            progress.phase = 'read';
            const facts = await target.read();
            if (facts?.number === context.issueNumber && planIssueCompletion(facts, context.completionLabels).kind === 'deferred') {
                return [deferredDeploymentCompletionResult(this.taskId, facts, true)];
            }
            const repaired = await reconcileIssueCompletionMetadata(target, context.issueNumber, context.completionLabels, progress, facts);
            return [new Result({ id: this.taskId, success: true, executed: progress.labelsChanged > 0,
                steps: ['The closed issue completion metadata was verified; historical and unrelated labels were retained.'],
                payload: { issueCompletion: { nativeClosed: progress.nativeClosed, labelsChanged: progress.labelsChanged, reconciled: true, ...repaired } } })];
        } catch (cause) {
            return [new Result({ id: this.taskId, success: false, executed: progress.labelsChanged > 0,
                steps: [progress.nativeClosed ? 'The issue remains closed; completion metadata could not be fully verified. Inspect and retry the closed-issue workflow.'
                    : 'Current native issue closure could not be verified; completion repair stopped without changing native state.'],
                errors: [closedIssueReconciliationError(cause, { resultId: this.taskId, phase: progress.phase, state: progress.state, reason: progress.reason, changed: progress.labelsChanged, remaining: progress.remaining })],
                payload: { issueCompletion: { nativeClosed: progress.nativeClosed, labelsChanged: progress.labelsChanged, reconciled: false } } })];
        }
    }
}

function stale(): ApplicationError {
    return new ApplicationError('workflow.stale', 'The native closed issue identity, reason, or completion metadata changed or is unavailable.');
}
