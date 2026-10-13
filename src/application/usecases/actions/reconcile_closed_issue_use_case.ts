import type { Result } from '../../../data/model/result';
import type { ParamUseCase } from '../base/param_usecase';
import type { RetireBranchSyncContext } from './retire_branch_sync_use_case';
import type { ClosedIssueMetadataContext } from './reconcile_closed_issue_metadata_use_case';

export type ClosedIssueRetirementContext = RetireBranchSyncContext & ClosedIssueMetadataContext;

/** Retain independent cleanup results when metadata or existing cards fail. */
export class ReconcileClosedIssueUseCase implements ParamUseCase<ClosedIssueRetirementContext, Result[]> {
    readonly taskId = 'ReconcileClosedIssueUseCase';
    constructor(private readonly metadata: ParamUseCase<ClosedIssueMetadataContext, Result[]>,
        private readonly cards: ParamUseCase<RetireBranchSyncContext, Result[]>) {}
    async invoke(context: ClosedIssueRetirementContext): Promise<Result[]> {
        return [...await this.metadata.invoke(context), ...await this.cards.invoke(context)];
    }
}
