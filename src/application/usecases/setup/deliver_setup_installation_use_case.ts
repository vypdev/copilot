import type { SetupInstallationDeliveryState, SetupInstallationRefEffect } from '../../contracts/setup_installation_delivery';
import type { SetupInstallationDeliveryCommands, SetupInstallationDeliveryControl, SetupInstallationDeliveryCoordinator } from '../../ports/setup_installation_delivery_ports';
import { SetupInstallationDeliveryCancelled, SetupInstallationObservedEffectError, SetupInstallationSnapshotChanged } from '../../ports/setup_installation_delivery_ports';

export class SetupInstallationDeliveryError extends Error {
  constructor(readonly reason: 'cancelled' | 'drift' | 'uncertain-preparation' | 'provider',
    readonly retained: SetupInstallationDeliveryState) {
    super(`Setup file delivery stopped: ${reason}. Inspect the retained operation before resuming.`);
  }
}

/** Common prepare/ref/PR coordinator; no configuration, resource stages or provider DTOs. */
export class DeliverSetupInstallationUseCase implements SetupInstallationDeliveryCoordinator {
  async execute(commands: SetupInstallationDeliveryCommands, control: SetupInstallationDeliveryControl,
    initial: SetupInstallationDeliveryState): Promise<SetupInstallationDeliveryState> {
    let state: SetupInstallationDeliveryState = { ...initial, effects: [...initial.effects] };
    const retain = async (next: SetupInstallationDeliveryState): Promise<void> => {
      state = next;
      await control.retain(state);
    };
    const active = (): void => {
      if (!control.active()) throw new SetupInstallationDeliveryError('cancelled', state);
    };
    const fresh = async (): Promise<void> => {
      active();
      if (!await control.revalidate()) throw new SetupInstallationDeliveryError('drift', state);
      active();
    };
    try {
      // An unknown Git-object POST cannot be discovered safely by guessing its ID.
      if (state.uncertain === 'prepared-objects') throw new SetupInstallationDeliveryError('uncertain-preparation', state);
      if (!state.preparedCommit) {
        await fresh();
        await retain({ ...state, uncertain: 'prepared-objects' });
        if (!control.active()) {
          // This owner has not invoked an object command. Persist that proof
          // before allowing reviewed recovery; a failed save keeps uncertainty.
          const notStarted = { ...state, uncertain: undefined };
          await control.retain(notStarted);
          state = notStarted;
          throw new SetupInstallationDeliveryError('cancelled', state);
        }
        let treeCreated = false;
        const commit = await commands.prepareCommit(async event => {
          if (event.effect === 'tree' && event.state === 'completed') treeCreated = true;
          // Legacy batch journals cannot retain a tree ID. A known tree without
          // a commit remains uncertain; only proof of no object POST clears it.
          if (event.effect === 'tree' && event.state === 'not-started' && !treeCreated) {
            await retain({ ...state, uncertain: undefined });
          }
          if (event.effect === 'commit' && event.state === 'completed') {
            if (!/^[a-f0-9]{40}$/u.test(event.sha)) throw new SetupInstallationDeliveryError('provider', state);
            await retain({ ...state, preparedCommit: event.sha, uncertain: undefined });
          }
        });
        if (!/^[a-f0-9]{40}$/u.test(commit)) throw new SetupInstallationDeliveryError('provider', state);
        await retain({ ...state, preparedCommit: commit, uncertain: undefined });
      }
      const commit = state.preparedCommit!;
      const effect = async (name: SetupInstallationRefEffect, work: (inspectOnly: boolean) => Promise<void>): Promise<void> => {
        if (state.effects.includes(name)) return;
        await fresh();
        const inspectOnly = state.uncertain === name && control.recovery !== 'reviewed-create-if-absent';
        await retain({ ...state, uncertain: name });
        active();
        await work(inspectOnly);
        await retain({ ...state, effects: [...state.effects, name], uncertain: undefined });
      };
      await effect('branch', inspectOnly => commands.branch(commit, inspectOnly));
      await effect('pull-request', async inspectOnly => {
        const number = await commands.pullRequest(commit, inspectOnly);
        if (!Number.isSafeInteger(number) || number <= 0) throw new SetupInstallationDeliveryError('provider', state);
        state = { ...state, pullRequestNumber: number };
      });
      return state;
    } catch (error) {
      if (error instanceof SetupInstallationDeliveryError) throw error;
      if (error instanceof SetupInstallationObservedEffectError) {
        const observed = error.observed;
        const number = observed.effect === 'pull-request' ? observed.pullRequestNumber : undefined;
        const keys = observed.effect === 'branch' ? 'commit,effect' : 'commit,effect,pullRequestNumber';
        if (!['branch', 'pull-request'].includes(observed.effect) || !['cancelled', 'drift'].includes(error.reason)
          || Object.keys(observed).sort().join(',') !== keys || typeof observed.commit !== 'string' || !/^[a-f0-9]{40}$/u.test(observed.commit)
          || observed.commit !== state.preparedCommit || state.uncertain !== observed.effect || state.effects.includes(observed.effect)
          || observed.effect === 'pull-request' && (!state.effects.includes('branch') || !Number.isSafeInteger(number) || Number(number) <= 0
            || state.pullRequestNumber !== undefined && state.pullRequestNumber !== number)) throw new SetupInstallationDeliveryError('provider', state);
        // Knowledge of an owned object survives loss of authority. Persist that
        // historical fact before stopping; it never authorizes the next phase.
        await retain({ ...state, effects: [...state.effects, observed.effect], uncertain: undefined,
          ...(observed.effect === 'pull-request' ? { pullRequestNumber: number } : {}) });
        throw new SetupInstallationDeliveryError(error.reason, state);
      }
      if (error instanceof SetupInstallationDeliveryCancelled) throw new SetupInstallationDeliveryError('cancelled', state);
      if (error instanceof SetupInstallationSnapshotChanged) throw new SetupInstallationDeliveryError('drift', state);
      throw new SetupInstallationDeliveryError('provider', state);
    }
  }
}
