import type { SetupBatchOperation, SetupBatchPlan } from '../../../domain/setup_batch';
import type { SetupBatchApplyPort, SetupBatchJournalPort, SetupBatchPresentationPort } from '../../ports/setup_batch_ports';
import { beginSetupBatchOperation, parseSetupBatchOperation, assertSetupBatchOperationMatchesPlan } from '../../policies/setup_batch_policy';
import type { ApplySetupBatchUseCase } from './apply_setup_batch_use_case';
import type { PrepareSetupBatchUseCase } from './prepare_setup_batch_use_case';
import type { SelectSetupBatchTargetsUseCase } from './select_setup_batch_targets_use_case';
import type { SetupJourneyOutcome } from '../../policies/setup_journey_policy';

export interface SetupBatchSessionPorts {
  readonly selection: Pick<SelectSetupBatchTargetsUseCase, 'execute'>;
  readonly prepare: Pick<PrepareSetupBatchUseCase, 'execute'>;
  readonly writer: SetupBatchApplyPort;
  readonly apply: Pick<ApplySetupBatchUseCase, 'execute'>;
  readonly journal: SetupBatchJournalPort;
  readonly presentation: SetupBatchPresentationPort;
  result(plan: SetupBatchPlan, operation: SetupBatchOperation, retryRemaining: number): Promise<'retry' | 'finish'>;
  planning(repository: string): void;
  possibleMutation(): void;
  sessionActive?(): boolean;
  audit(plan: SetupBatchPlan['targets'][number], token: string): Promise<{ readonly ready: boolean; readonly cleanupPending?: boolean }>;
}
/** One coordinator for both presentations; a retry requires another review and fresh write preflight. */
export class SetupBatchSessionUseCase {
  constructor(private readonly ports: SetupBatchSessionPorts) {}
  async execute(request: { readonly organization: string; readonly currentRepository: string; readonly token: string; readonly resumeOperationId?: string }): Promise<{
    readonly outcome: SetupJourneyOutcome; readonly operation: SetupBatchOperation }> {
    const resumed = request.resumeOperationId ? await this.ports.journal.load(request.resumeOperationId) : undefined;
    if (request.resumeOperationId && !resumed) throw new Error('The setup operation journal was not found. Inspect the existing PR before starting a new operation.');
    const prior = resumed ? parseSetupBatchOperation(resumed) : undefined;
    if (prior && prior.organization.toLowerCase() !== request.organization.toLowerCase()) throw new Error('The saved setup belongs to another organization.');
    const selection = prior ? { token: request.token, selected: prior.targets.map(target => ({ id: target.repositoryId, name: target.repository })) }
      : await this.ports.selection.execute(request);
    this.ports.planning(request.organization);
    const plan = await this.ports.prepare.execute({ organization: request.organization, ...selection, ...(prior ? { operationId: prior.operationId } : {}) });
    const saved = await this.ports.journal.load(plan.operationId);
    let operation = saved ? parseSetupBatchOperation(saved) : beginSetupBatchOperation(plan);
    assertSetupBatchOperationMatchesPlan(operation, plan);
    if (operation.targets.some(target => target.cleanupPending)) {
      await this.ports.result(plan, operation, 0);
      return { outcome: 'partial', operation };
    }
    if (operation.targets.every(target => ['blocked', 'waiting-for-merge', 'verification-pending', 'unchanged'].includes(target.status))) {
      await this.ports.result(plan, operation, 0);
      return { outcome: operation.targets.some(target => target.status === 'blocked')
        ? operation.targets.some(target => target.effects.length > 0) ? 'partial' : 'blocked' : 'complete', operation };
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!(this.ports.sessionActive?.() ?? this.ports.presentation.active()) || !await this.ports.presentation.review(plan, operation)) {
        return { outcome: operation.targets.some(target => target.effects.length > 0) ? 'partial' : 'cancelled', operation };
      }
      if (operation.targets.some(target => ['ready', 'partial', 'cancelled', 'applying'].includes(target.status))) {
        let cleanupPending: boolean;
        const unlock = await this.ports.journal.lock(plan.operationId);
        try {
          const latest = await this.ports.journal.load(plan.operationId);
          if (latest) operation = parseSetupBatchOperation(latest);
          assertSetupBatchOperationMatchesPlan(operation, plan);
          cleanupPending = operation.targets.some(target => target.cleanupPending);
          await this.ports.journal.save(operation);
          for (let index = 0; index < plan.targets.length; index += 1) {
            if (cleanupPending || !this.ports.presentation.active()) break;
            if (!['ready', 'partial', 'cancelled', 'applying'].includes(operation.targets[index].status)) continue;
            let fresh = false;
            let unavailable = false;
            try { fresh = await this.ports.writer.revalidate(plan.targets[index], selection.token, operation.targets[index].effects); }
            catch { unavailable = true; }
            if (!fresh) {
              operation = { ...operation, targets: operation.targets.map((target, position) => position === index
                ? { ...target, status: 'blocked' as const, reason: unavailable ? 'provider' as const : 'drift' as const } : target) };
              await this.ports.journal.save(operation);
              this.ports.presentation.progress(operation);
              continue;
            }
            operation = { ...operation, targets: operation.targets.map((target, position) => position === index
              ? { ...target, status: 'applying' as const } : target) };
            await this.ports.journal.save(operation);
            this.ports.presentation.progress(operation);
            this.ports.possibleMutation();
            let audit: { readonly ready: boolean; readonly cleanupPending?: boolean };
            let rejected = false;
            try { audit = await this.ports.audit(plan.targets[index], selection.token); }
            catch {
              // A rejected audit has no trustworthy cleanup report. Persist the
              // uncertainty and stop all further mutation, including on resume.
              rejected = true;
              audit = { ready: false, cleanupPending: true };
            }
            cleanupPending ||= audit.cleanupPending === true;
            if (!audit.ready || audit.cleanupPending) {
              operation = { ...operation, targets: operation.targets.map((target, position) => position === index
                ? { ...target, status: 'blocked' as const, reason: rejected ? 'provider' as const : 'permission' as const,
                  ...(audit.cleanupPending ? { cleanupPending: true as const } : {}) } : target) };
              await this.ports.journal.save(operation);
              this.ports.presentation.progress(operation);
            }
            if (cleanupPending) break;
          }
          if (cleanupPending) {
            operation = { ...operation, targets: operation.targets.map(target => ['ready', 'applying', 'partial', 'cancelled'].includes(target.status)
              ? { ...target, status: 'cancelled' as const, reason: 'cancelled' as const } : target) };
            await this.ports.journal.save(operation);
            this.ports.presentation.progress(operation);
          }
        } finally { await unlock(); }
        if (cleanupPending) {
          await this.ports.result(plan, operation, 0);
          return { outcome: 'partial', operation };
        }
        operation = await this.ports.apply.execute(plan, selection.token);
      }
      const retryRemaining = 1 - attempt;
      const decision = await this.ports.result(plan, operation, retryRemaining);
      if (decision !== 'retry' || retryRemaining === 0 || !operation.targets.some(target => ['partial', 'cancelled', 'applying'].includes(target.status))) break;
    }
    const complete = operation.targets.every(target => ['waiting-for-merge', 'verification-pending', 'unchanged'].includes(target.status));
    return { outcome: complete ? 'complete' : operation.targets.some(target => target.effects.length > 0) ? 'partial' : 'blocked', operation };
  }
}
