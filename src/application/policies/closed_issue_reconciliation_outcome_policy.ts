import { getResultPayload, type Result } from '../../data/model/result';
import { CLOSED_ISSUE_RESULTS } from '../../domain/closed_issue_reconciliation';

/** Summary consumes semantic counts; internal result identifiers never become presentation. */
export function projectClosedIssueCleanupCounts(results: readonly Result[]):
    { status: 'absent' | 'invalid' } | { status: 'valid'; counts: { reconciled: number; converged: number } } {
    let reconciled = 0;
    let converged = 0;
    let invalid = false;
    for (const result of results.filter(result => CLOSED_ISSUE_RESULTS.some(id => id === result.id))) {
        const payload = getResultPayload(result.payload);
        if (!result.success || result.errors?.length) { invalid = true; continue; }
        if (!payload) continue;
        const completion = result.id === 'CloseIssueAfterMergingUseCase' || result.id === 'ReconcileClosedIssueMetadataUseCase'
            ? getResultPayload(payload.issueCompletion) : payload;
        if (completion?.outcome === 'deferred' && completion.deploymentCompletion === 'pending' && result.executed === false) continue;
        if (completion?.outcome === 'not-applicable' && completion.nativeClosed === false) continue;
        if (completion?.nativeClosed !== true || completion.reconciled !== true) { invalid = true; continue; }
        if (completion.outcome === 'already-converged') converged++;
        else if (completion.outcome === 'reconciled') reconciled++;
        else invalid = true;
    }
    if (!invalid && !reconciled && !converged) return { status: 'absent' };
    return invalid ? { status: 'invalid' } : { status: 'valid', counts: { reconciled, converged } };
}
