import type { SetupInstallationDeliveryState } from '../contracts/setup_installation_delivery';

/** Bound to one immutable approved plan and its private credential session by composition. */
export interface SetupInstallationDeliveryCommands {
  prepareCommit(observe?: SetupInstallationObjectObserver): Promise<string>;
  branch(commit: string, inspectOnly: boolean): Promise<void>;
  pullRequest(commit: string, inspectOnly: boolean): Promise<number>;
}
export interface SetupInstallationDeliveryControl {
  active(): boolean;
  revalidate(): Promise<boolean>;
  retain(state: SetupInstallationDeliveryState): Promise<void>;
  /** Only after renewed review: inspect exact ownership and create a confirmed absent ref/PR. */
  readonly recovery?: 'reviewed-create-if-absent';
}

/** Stateless common file phases supplied by a composition root, never constructed by an application caller. */
export interface SetupInstallationDeliveryCoordinator {
  execute(commands: SetupInstallationDeliveryCommands, control: SetupInstallationDeliveryControl,
    initial: SetupInstallationDeliveryState): Promise<SetupInstallationDeliveryState>;
}

export type SetupInstallationObjectEffect =
  | { readonly effect: 'tree' | 'commit'; readonly state: 'starting' }
  | { readonly effect: 'tree' | 'commit'; readonly state: 'not-started' }
  | { readonly effect: 'tree' | 'commit'; readonly state: 'completed'; readonly sha: string };
export type SetupInstallationObjectObserver = (effect: SetupInstallationObjectEffect) => Promise<void>;

/** A verified historical observation, never approval for another provider phase. */
export type SetupInstallationObservedEffect =
  | { readonly effect: 'branch'; readonly commit: string }
  | { readonly effect: 'pull-request'; readonly commit: string; readonly pullRequestNumber: number };

/** Complete ownership was observed before the final authority/cancellation check stopped the command. */
export class SetupInstallationObservedEffectError extends Error {
  readonly observed: SetupInstallationObservedEffect;
  constructor(readonly reason: 'cancelled' | 'drift', observed: SetupInstallationObservedEffect) {
    super('Setup file delivery stopped after a verified object observation. Inspect the retained operation before resuming.');
    this.observed = Object.freeze({ ...observed });
  }
}

/** A verified snapshot mismatch, distinct from an unavailable provider read. */
export class SetupInstallationSnapshotChanged extends Error {
  constructor() { super('GitHub setup request is unknown because the reviewed installation snapshot changed.'); }
}

/** Observed before dispatch; no provider write was started by that command. */
export class SetupInstallationDeliveryCancelled extends Error {
  constructor() { super('Setup file delivery was cancelled before provider dispatch.'); }
}
