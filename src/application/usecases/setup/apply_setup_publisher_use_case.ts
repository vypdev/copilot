import type { SetupPublisherFileEffect, SetupPublisherOperation, SetupPublisherPlan } from '../../../domain/setup_publisher_installation';
import type { SetupInstallationDeliveryState } from '../../contracts/setup_installation_delivery';
import type { SetupInstallationObjectObserver } from '../../ports/setup_installation_delivery_ports';
import { SetupInstallationObservedEffectError, SetupInstallationSnapshotChanged } from '../../ports/setup_installation_delivery_ports';
import type { SetupPublisherApplyPorts } from '../../ports/setup_publisher_apply_ports';
import { parseSetupPublisherOperation, setupPublisherOperationMatchesPlan } from '../../policies/setup_publisher_installation_policy';
import { setupPublisherApprovalMatches } from '../../policies/setup_publisher_plan_policy';
import { SetupInstallationDeliveryError } from './deliver_setup_installation_use_case';

export type SetupPublisherApplyFailure = 'operation-mismatch' | 'uncertain-preparation' | 'cancelled' | 'stale' | 'journal' | 'delivery';
export class SetupPublisherApplyError extends Error {
  constructor(readonly reason: SetupPublisherApplyFailure, readonly retained: SetupPublisherOperation,
    readonly lastPersisted: SetupPublisherOperation | undefined) {
    super(`Publisher delivery stopped: ${reason}. Inspect the retained operation before resuming.`);
  }
}

/** Invoked only by fresh review admission; shared delivery owns prepare/ref/PR phases. */
export class ApplySetupPublisherUseCase {
  constructor(private readonly ports: SetupPublisherApplyPorts) {}

  async execute(plan: SetupPublisherPlan, session: object, revalidate: () => Promise<boolean>,
    reviewedOperation?: SetupPublisherOperation): Promise<SetupPublisherOperation> {
    let operation = initialOperation(plan), lastPersisted: SetupPublisherOperation | undefined;
    let journalFailed = false;
    const fail = (reason: SetupPublisherApplyFailure) => new SetupPublisherApplyError(reason, operation, lastPersisted);
    const journal = async <T>(work: () => Promise<T>): Promise<T> => {
      try { return await work(); }
      catch { journalFailed = true; throw fail('journal'); }
    };
    const retain = async (next: SetupPublisherOperation): Promise<void> => {
      operation = parseSetupPublisherOperation(next);
      await journal(() => this.ports.journal.save(operation));
      lastPersisted = operation;
    };
    if (!setupPublisherApprovalMatches(plan, plan.files)) throw fail('operation-mismatch');
    let expected: SetupPublisherOperation | undefined;
    try { expected = reviewedOperation === undefined ? undefined : parseSetupPublisherOperation(reviewedOperation); }
    catch { throw fail('operation-mismatch'); }
    if (expected && !setupPublisherOperationMatchesPlan(expected, plan)) throw fail('operation-mismatch');
    const release = await journal(() => this.ports.journal.lock(plan.operationId));
    try {
      const current = await journal(() => this.ports.journal.load(plan.operationId));
      if (JSON.stringify(current) !== JSON.stringify(expected)) throw fail('operation-mismatch');
      if (current) { operation = parseSetupPublisherOperation(current); lastPersisted = operation; }
      if (!this.ports.active()) throw fail('cancelled');
      const fresh = async (): Promise<boolean> => this.ports.active() && await revalidate() && this.ports.active();
      if (!await fresh()) throw fail(this.ports.active() ? 'stale' : 'cancelled');
      if (operation.uncertain === 'tree' || operation.uncertain === 'commit') throw fail('uncertain-preparation');
      const writer = this.ports.delivery(plan, session, fresh);
      // A completed journal is metadata, never fresh proof that its ref/PR still match.
      if (operation.effects.includes('pull-request')) {
        await writer.branch(operation.preparedCommit!, true);
        if (await writer.pullRequest(operation.preparedCommit!, true) !== operation.pullRequestNumber) throw fail('operation-mismatch');
        if (operation.status !== 'waiting-for-merge') await retain({ ...operation, status: 'waiting-for-merge' });
        return operation;
      }
      await retain({ ...operation, status: 'applying' });
      const observe: SetupInstallationObjectObserver = async event => {
        const next: SetupPublisherFileEffect = operation.preparedTree ? 'commit' : 'tree';
        if (event.effect !== next || operation.preparedCommit) throw fail('delivery');
        if (event.state === 'not-started') {
          if (operation.uncertain === event.effect) await retain({ ...operation, uncertain: undefined });
          return;
        }
        if (event.state === 'starting') await retain({ ...operation, uncertain: event.effect });
        else {
          if (operation.uncertain !== event.effect) throw fail('delivery');
          await retain({ ...operation, effects: [...operation.effects, event.effect], uncertain: undefined,
            ...(event.effect === 'tree' ? { preparedTree: event.sha } : { preparedCommit: event.sha }) });
        }
      };
      const deliveryState: SetupInstallationDeliveryState = {
        preparedCommit: operation.preparedCommit, pullRequestNumber: operation.pullRequestNumber,
        effects: operation.effects.filter(effect => effect === 'branch' || effect === 'pull-request'),
        uncertain: operation.uncertain,
      };
      try {
        await this.ports.coordinator.execute({
          prepareCommit: () => writer.prepareCommit(observe, operation.preparedTree),
          branch: (commit, inspectOnly) => writer.branch(commit, inspectOnly),
          pullRequest: (commit, inspectOnly) => writer.pullRequest(commit, inspectOnly),
        }, {
          active: () => this.ports.active(), revalidate: fresh, recovery: 'reviewed-create-if-absent',
          retain: async state => {
            if (state.preparedCommit !== undefined && state.preparedCommit !== operation.preparedCommit) throw fail('delivery');
            const uncertain = state.uncertain === 'prepared-objects'
              ? operation.preparedTree ? 'commit' : 'tree' : state.uncertain;
            await retain({ ...operation, uncertain, pullRequestNumber: state.pullRequestNumber,
              effects: [...operation.effects.filter(effect => effect === 'tree' || effect === 'commit'), ...state.effects] });
          },
        }, deliveryState);
        await retain({ ...operation, status: 'waiting-for-merge' });
        return operation;
      } catch (error) {
        if (journalFailed) throw fail('journal');
        const stoppedBy = (error as SetupInstallationDeliveryError).reason;
        const reason = stoppedBy === 'cancelled' || stoppedBy === 'drift' && !this.ports.active()
          ? 'cancelled' : stoppedBy === 'drift' ? 'stale' : 'delivery';
        await retain({ ...operation, status: operation.effects.length || operation.uncertain ? 'partial'
          : reason === 'cancelled' ? 'cancelled' : 'blocked' });
        throw fail(reason);
      }
    } catch (error) {
      if (error instanceof SetupPublisherApplyError) throw error;
      if (error instanceof SetupInstallationObservedEffectError) throw fail(!this.ports.active() || error.reason === 'cancelled' ? 'cancelled' : 'stale');
      throw fail(!this.ports.active() ? 'cancelled' : error instanceof SetupInstallationSnapshotChanged ? 'stale' : 'delivery');
    } finally { await journal(release); }
  }
}

function initialOperation(plan: SetupPublisherPlan): SetupPublisherOperation {
  return parseSetupPublisherOperation({ schemaVersion: 2, purpose: plan.purpose, operationId: plan.operationId,
    repositoryId: plan.target.id, repository: `${plan.target.owner}/${plan.target.name}`,
    defaultBranch: plan.target.defaultBranch, baseSha: plan.target.baseSha, sourceCommit: plan.sourceCommit,
    planDigest: plan.digest, approvalDigest: plan.approvalDigest, actorId: plan.actorId, status: 'ready', effects: [] });
}
