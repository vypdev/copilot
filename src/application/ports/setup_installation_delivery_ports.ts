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

/** A verified snapshot mismatch, distinct from an unavailable provider read. */
export class SetupInstallationSnapshotChanged extends Error {
  constructor() { super('GitHub setup request is unknown because the reviewed installation snapshot changed.'); }
}

/** Observed before dispatch; no provider write was started by that command. */
export class SetupInstallationDeliveryCancelled extends Error {
  constructor() { super('Setup file delivery was cancelled before provider dispatch.'); }
}
