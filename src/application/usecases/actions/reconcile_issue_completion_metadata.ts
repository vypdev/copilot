import { ApplicationError } from '../../errors/application_error';
import type { BoundIssueCompletionMetadataPort } from '../../ports/issue_completion_ports';
import { planIssueCompletion, type IssueCompletionLabelConfiguration, type NativeIssueCompletionFacts } from '../../../domain/issue_completion';
import { CLOSED_ISSUE_REASONS, type ClosedIssueReconciliationFacts } from '../../../domain/closed_issue_reconciliation';

export interface CompletionRepairProgress {
    nativeClosed: boolean;
    labelsChanged: number;
    phase: ClosedIssueReconciliationFacts['phase'];
    state: ClosedIssueReconciliationFacts['state'];
    reason: ClosedIssueReconciliationFacts['reason'];
    remaining: number;
}
export const completionRepairProgress = (): CompletionRepairProgress => ({ nativeClosed: false, labelsChanged: 0,
    phase: 'identity', state: 'unavailable', reason: 'unavailable', remaining: 0 });

/** At most two bounded selective passes, with fresh native fences before every write. */
export async function reconcileIssueCompletionMetadata(
    target: ReturnType<BoundIssueCompletionMetadataPort['forIssue']>, number: number,
    configuration: IssueCompletionLabelConfiguration, progress: CompletionRepairProgress,
    initial?: NativeIssueCompletionFacts,
): Promise<{ reason: NativeIssueCompletionFacts['reason']; outcome: 'reconciled' | 'already-converged'; superseded: boolean }> {
    let expectedReason: NativeIssueCompletionFacts['reason'] | undefined;
    let superseded = false;
    const read = async (phase: CompletionRepairProgress['phase'], snapshot?: NativeIssueCompletionFacts) => {
        progress.phase = phase; progress.state = 'unavailable'; progress.reason = 'unavailable';
        const facts = snapshot ?? await target.read();
        progress.nativeClosed = facts?.number === number && facts.state === 'closed';
        progress.state = facts?.number === number && ['open', 'closed'].includes(facts.state) ? facts.state : 'unavailable';
        progress.reason = CLOSED_ISSUE_REASONS.some(reason => reason === facts?.reason) ? facts.reason : 'unavailable';
        const plan = planIssueCompletion(facts, configuration);
        if (!progress.nativeClosed || plan.kind !== 'closed' || expectedReason !== undefined && facts.reason !== expectedReason) {
            throw new ApplicationError('workflow.stale', 'The native issue identity, state or closure reason changed.');
        }
        expectedReason = facts.reason;
        progress.remaining = plan.remove.length + plan.add.length;
        return plan;
    };
    let plan = await read('read', initial);
    for (let pass = 0; pass < 2; pass++) {
        for (const label of plan.remove) {
            if (!(await read('label-remove')).remove.includes(label)) { superseded = true; continue; }
            try { await target.removeLabel(label); progress.labelsChanged++; }
            catch (cause) {
                if ((await read('label-remove')).remove.includes(label)) throw cause;
                superseded = true;
            }
        }
        for (const label of plan.add) {
            if (!(await read('label-add')).add.includes(label)) { superseded = true; continue; }
            try { await target.addLabel(label); progress.labelsChanged++; }
            catch (cause) {
                if ((await read('label-add')).add.includes(label)) throw cause;
                superseded = true;
            }
        }
        plan = await read('metadata-verification');
        if (!progress.remaining) return { reason: plan.reason,
            outcome: progress.labelsChanged ? 'reconciled' : 'already-converged', superseded };
        superseded = true;
    }
    throw new ApplicationError('provider.conflict', 'Completion metadata remains incomplete after two bounded passes.');
}
