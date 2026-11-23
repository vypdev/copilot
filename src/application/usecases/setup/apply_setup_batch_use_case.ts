import type { SetupInstallationDeliveryCoordinator } from '../../ports/setup_installation_delivery_ports';
import type { SetupBatchOperation, SetupBatchPlan, SetupBatchTargetReceipt } from '../../../domain/setup_batch';
import type { SetupBatchApplyPort, SetupBatchJournalPort, SetupBatchPresentationPort } from '../../ports/setup_batch_ports';
import { beginSetupBatchOperation, parseSetupBatchOperation, assertSetupBatchOperationMatchesPlan } from '../../policies/setup_batch_policy';
import { SetupInstallationDeliveryError } from './deliver_setup_installation_use_case';

const resourceEffects = ['access', 'variables', 'labels', 'issue-types'] as const;

export class ApplySetupBatchUseCase {
  private applying = false;
  constructor(private readonly ports: { readonly coordinator: SetupInstallationDeliveryCoordinator; readonly writer: SetupBatchApplyPort; readonly journal: SetupBatchJournalPort;
    readonly presentation: SetupBatchPresentationPort }) {}
  async execute(plan: SetupBatchPlan, token: string): Promise<SetupBatchOperation> {
    if (this.applying) throw new Error('A setup Apply is already active in this session.');
    this.applying = true;
    let unlock: (() => Promise<void>) | undefined;
    try {
      const initial = beginSetupBatchOperation(plan);
      unlock = await this.ports.journal.lock(plan.operationId);
      const saved = await this.ports.journal.load(plan.operationId);
      let operation = saved ? parseSetupBatchOperation(saved) : initial;
      assertSetupBatchOperationMatchesPlan(operation, plan);
      if (operation.targets.some(target => target.cleanupPending)) return operation;
      if (!this.ports.presentation.active() || !await this.ports.presentation.review(plan, operation)) return operation;
      await this.ports.journal.save(operation);
      const update = async (index: number, receipt: SetupBatchTargetReceipt): Promise<void> => {
        operation = { ...operation, targets: operation.targets.map((target, position) => position === index ? receipt : target) };
        await this.ports.journal.save(operation);
        this.ports.presentation.progress(operation);
      };
      for (let index = 0; index < plan.targets.length; index += 1) {
        const targetPlan = plan.targets[index];
        let receipt = operation.targets[index];
        const retainedReceipt = receipt;
        if (['waiting-for-merge', 'verification-pending', 'unchanged', 'blocked'].includes(receipt.status)) continue;
        if (!this.ports.presentation.active()) {
          await update(index, { ...receipt, status: 'cancelled', reason: receipt.reason === 'preflight' ? 'preflight' : 'cancelled' });
          continue;
        }
        receipt = { ...receipt, status: 'applying', reason: receipt.reason === 'preflight' ? 'preflight' : undefined };
        await update(index, receipt);
        // Infer only from the retained state, before this invocation adds
        // resources. A prior unknown preparation must never become preflight.
        const interrupted = ['partial', 'applying', 'cancelled'].includes(retainedReceipt.status) && retainedReceipt.reason !== 'preflight';
        const uncertain = interrupted && !retainedReceipt.preparedCommit
          && resourceEffects.every(name => retainedReceipt.effects.includes(name))
          ? 'prepared-objects' as const : interrupted && retainedReceipt.preparedCommit
            ? !retainedReceipt.effects.includes('branch') ? 'branch' as const : !retainedReceipt.effects.includes('pull-request') ? 'pull-request' as const : undefined : undefined;
        let deliveryStarted = false;
        const effect = async (name: SetupBatchTargetReceipt['effects'][number], work: () => Promise<void>): Promise<void> => {
          if (receipt.effects.includes(name)) return;
          if (!this.ports.presentation.active()) throw new CancelledSetupApply();
          if (!await this.ports.writer.revalidate(targetPlan, token, receipt.effects)) throw new StaleSetupApply();
          await work();
          receipt = { ...receipt, effects: [...receipt.effects, name] };
          await update(index, receipt);
        };
        try {
          if (!await this.ports.writer.revalidate(targetPlan, token, receipt.effects)) throw new StaleSetupApply();
          await effect('access', async () => {
            for (const grant of targetPlan.grants) {
              if (!this.ports.presentation.active()) throw new CancelledSetupApply();
              await this.ports.writer.grant(targetPlan, grant, token);
            }
          });
          await effect('variables', () => this.ports.writer.variables(targetPlan, token));
          await effect('labels', () => this.ports.writer.labels(targetPlan, token));
          await effect('issue-types', () => this.ports.writer.issueTypes(targetPlan, token));
          if (!targetPlan.files.length) {
            await update(index, { ...receipt, status: 'verification-pending' }); continue;
          }
          deliveryStarted = true;
          await this.ports.coordinator.execute({
            prepareCommit: observe => this.ports.writer.prepareCommit(targetPlan, plan.operationId, token, observe, () => this.ports.presentation.active()),
            branch: (commit, inspectOnly) => this.ports.writer.branch(targetPlan, plan.operationId, commit, token, inspectOnly, () => this.ports.presentation.active()),
            pullRequest: (commit, inspectOnly) => this.ports.writer.pullRequest(targetPlan, plan.operationId, commit, token, inspectOnly, () => this.ports.presentation.active()),
          }, {
            active: () => this.ports.presentation.active(),
            revalidate: () => this.ports.writer.revalidate(targetPlan, token, receipt.effects),
            recovery: 'reviewed-create-if-absent',
            retain: async state => {
              receipt = { ...receipt, preparedCommit: state.preparedCommit, pullRequestNumber: state.pullRequestNumber,
                reason: !state.preparedCommit && state.uncertain === undefined ? 'preflight' : undefined,
                effects: [...receipt.effects.filter(name => name !== 'branch' && name !== 'pull-request'), ...state.effects] };
              await update(index, receipt);
            },
          }, { preparedCommit: receipt.preparedCommit, pullRequestNumber: receipt.pullRequestNumber,
            effects: receipt.effects.filter(name => name === 'branch' || name === 'pull-request'), uncertain });
          await update(index, { ...receipt, status: 'waiting-for-merge' });
        } catch (error) {
          const stale = error instanceof StaleSetupApply || error instanceof SetupInstallationDeliveryError && error.reason === 'drift';
          const cancelled = error instanceof CancelledSetupApply || error instanceof SetupInstallationDeliveryError && error.reason === 'cancelled';
          const beforePreparation = !receipt.preparedCommit && ((!deliveryStarted && uncertain === undefined
            && resourceEffects.every(name => receipt.effects.includes(name))) || receipt.reason === 'preflight'
            || error instanceof SetupInstallationDeliveryError && !error.retained.preparedCommit && error.retained.uncertain === undefined);
          await update(index, { ...receipt, status: stale ? 'blocked' : cancelled ? 'cancelled' : 'partial',
          reason: stale ? 'drift' : beforePreparation ? 'preflight' : cancelled ? 'cancelled' : 'provider' });
        }
      }
      return operation;
    } finally { try { await unlock?.(); } finally { this.applying = false; } }
  }
}
class CancelledSetupApply extends Error {}
class StaleSetupApply extends Error {}
