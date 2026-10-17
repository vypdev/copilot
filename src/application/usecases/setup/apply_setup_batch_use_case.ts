import type { SetupBatchOperation, SetupBatchPlan, SetupBatchTargetReceipt } from '../../../domain/setup_batch';
import type { SetupBatchApplyPort, SetupBatchJournalPort, SetupBatchPresentationPort } from '../../ports/setup_batch_ports';
import { beginSetupBatchOperation, parseSetupBatchOperation, assertSetupBatchOperationMatchesPlan } from '../../policies/setup_batch_policy';

export class ApplySetupBatchUseCase {
  private applying = false;
  constructor(private readonly ports: { readonly writer: SetupBatchApplyPort; readonly journal: SetupBatchJournalPort;
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
        if (['waiting-for-merge', 'verification-pending', 'unchanged', 'blocked'].includes(receipt.status)) continue;
        if (!this.ports.presentation.active()) {
          await update(index, { ...receipt, status: 'cancelled', reason: 'cancelled' });
          continue;
        }
        receipt = { ...receipt, status: 'applying', reason: undefined };
        await update(index, receipt);
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
          if (!receipt.preparedCommit) {
            const commit = await this.ports.writer.prepareCommit(targetPlan, plan.operationId, token);
            receipt = { ...receipt, preparedCommit: commit };
            await update(index, receipt);
          }
          const commit = receipt.preparedCommit!;
          await effect('branch', () => this.ports.writer.branch(targetPlan, plan.operationId, commit, token));
          await effect('pull-request', async () => {
            const number = await this.ports.writer.pullRequest(targetPlan, plan.operationId, commit, token);
            receipt = { ...receipt, pullRequestNumber: number };
          });
          await update(index, { ...receipt, status: 'waiting-for-merge' });
        } catch (error) {
          await update(index, { ...receipt, status: error instanceof StaleSetupApply ? 'blocked'
            : error instanceof CancelledSetupApply ? 'cancelled' : 'partial',
          reason: error instanceof StaleSetupApply ? 'drift' : error instanceof CancelledSetupApply ? 'cancelled' : 'provider' });
        }
      }
      return operation;
    } finally { try { await unlock?.(); } finally { this.applying = false; } }
  }
}
class CancelledSetupApply extends Error {}
class StaleSetupApply extends Error {}
