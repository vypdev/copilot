import type { SetupPublisherOperation, SetupPublisherPlan } from '../../../domain/setup_publisher_installation';
import type { SetupPublisherApprovedAction, SetupPublisherReadSnapshot, SetupPublisherReviewPorts } from '../../ports/setup_publisher_review_ports';
import { setupBatchBranch } from '../../policies/setup_batch_policy';
import { parseSetupPublisherOperation, parseSetupPublisherProposal, setupPublisherOperationMatchesPlan } from '../../policies/setup_publisher_installation_policy';
import { planSetupPublisherInstallation } from '../../policies/setup_publisher_plan_policy';

export class SetupPublisherReviewError extends Error {
  constructor(readonly reason: 'invalid' | 'unavailable' | 'presentation' | 'stale' | 'cancelled') {
    super(`Publisher review stopped: ${reason}. Prepare and review a fresh snapshot before applying.`);
  }
}
export type SetupPublisherReviewResult<T> =
  | { readonly plan: SetupPublisherPlan; readonly stage: 'dry-run' | 'unchanged' | 'declined' | 'cancelled' }
  | { readonly plan: SetupPublisherPlan; readonly stage: 'apply'; readonly result: T };

/** Fresh review admission only. Shared delivery owns effects and durable recovery. */
export class ReviewSetupPublisherUseCase {
  constructor(private readonly ports: SetupPublisherReviewPorts) {}

  async execute<T>(input: { readonly proposal: unknown; readonly operationId: string; readonly dryRun: boolean;
    readonly reviewedOperation?: SetupPublisherOperation },
    apply: SetupPublisherApprovedAction<T>): Promise<SetupPublisherReviewResult<T>> {
    const { operationId, dryRun } = input;
    const proposal = (() => {
      try { setupBatchBranch(operationId); return parseSetupPublisherProposal(input.proposal); }
      catch { throw new SetupPublisherReviewError('invalid'); }
    })();
    const retained = input.reviewedOperation === undefined ? undefined : (() => {
      try {
        const operation = parseSetupPublisherOperation(input.reviewedOperation);
        return Object.freeze({ ...operation, effects: Object.freeze([...operation.effects]) });
      } catch { throw new SetupPublisherReviewError('invalid'); }
    })();
    if (!this.ports.active()) throw new SetupPublisherReviewError('cancelled');
    const inspect = async (): Promise<SetupPublisherReadSnapshot> => {
      try {
        const snapshot = await this.ports.inspect(proposal);
        if (snapshot.session === null || typeof snapshot.session !== 'object') throw new SetupPublisherReviewError('unavailable');
        return snapshot;
      } catch { throw new SetupPublisherReviewError(this.ports.active() ? 'unavailable' : 'cancelled'); }
    };
    const snapshot = await inspect();
    if (!this.ports.active()) throw new SetupPublisherReviewError('cancelled');
    const session = snapshot.session;
    const plan = planSetupPublisherInstallation(proposal, snapshot.inspection, operationId);
    if (retained && !setupPublisherOperationMatchesPlan(retained, plan)) throw new SetupPublisherReviewError('stale');
    try {
      if (retained) await this.ports.present(plan, retained);
      else await this.ports.present(plan);
    }
    catch { throw new SetupPublisherReviewError('presentation'); }
    if (!this.ports.active()) return { plan, stage: 'cancelled' };
    if (plan.status === 'unchanged') return { plan, stage: 'unchanged' };
    if (dryRun) return { plan, stage: 'dry-run' };
    if (!this.ports.active()) return { plan, stage: 'cancelled' };
    let answer: 'approve' | 'decline' | 'cancel';
    try { answer = await this.ports.confirm(plan); }
    catch { throw new SetupPublisherReviewError('presentation'); }
    if (answer !== 'approve') return { plan, stage: answer === 'decline' ? 'declined' : 'cancelled' };
    if (!this.ports.active()) return { plan, stage: 'cancelled' };
    let live = true;
    const revalidate = async (): Promise<boolean> => {
      if (!live || !this.ports.active()) { live = false; return false; }
      try {
        const next = await inspect();
        if (next.session !== session) { live = false; return false; }
        const current = planSetupPublisherInstallation(proposal, next.inspection, operationId);
        const matches = live && this.ports.active() && current.status === 'review'
          && current.digest === plan.digest && current.approvalDigest === plan.approvalDigest;
        if (!matches) live = false;
        return matches;
      } catch { live = false; return false; }
    };
    try {
      if (!await revalidate()) throw new SetupPublisherReviewError(this.ports.active() ? 'stale' : 'cancelled');
      return { plan, stage: 'apply', result: await apply(plan, session, revalidate) };
    } finally { live = false; }
  }
}
