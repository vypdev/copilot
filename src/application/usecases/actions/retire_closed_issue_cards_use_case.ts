import type { Result } from '../../../data/model/result';
import type { ParamUseCase } from '../base/param_usecase';
import type { RetireBranchSyncContext } from './retire_branch_sync_use_case';

/** Independent narrow retirements retain each result, including partial failure. */
export class RetireClosedIssueCardsUseCase implements ParamUseCase<RetireBranchSyncContext, Result[]> {
  readonly taskId = 'RetireClosedIssueCardsUseCase';
  constructor(private readonly synchronization: ParamUseCase<RetireBranchSyncContext, Result[]>,
    private readonly progress: ParamUseCase<RetireBranchSyncContext, Result[]>) {}
  async invoke(context: RetireBranchSyncContext): Promise<Result[]> {
    return [...await this.synchronization.invoke(context), ...await this.progress.invoke(context)];
  }
}
