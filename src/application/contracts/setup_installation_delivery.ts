import type { SetupBatchFile, SetupBatchInstallationReceipt, SetupBatchTarget } from '../../domain/setup_batch';

/** Final, approved bytes. Resource configuration and resource writers are absent. */
export interface SetupInstallationDeliveryPlan {
  readonly target: SetupBatchTarget;
  readonly operationId: string;
  readonly digest: string;
  readonly files: readonly SetupBatchFile[];
  readonly title: string;
  readonly body: string;
}

export type SetupInstallationReceipt = SetupBatchInstallationReceipt;
export type SetupInstallationRefEffect = 'branch' | 'pull-request';
export interface SetupInstallationDeliveryState {
  readonly preparedCommit?: string;
  readonly pullRequestNumber?: number;
  readonly effects: readonly SetupInstallationRefEffect[];
  readonly uncertain?: 'prepared-objects' | SetupInstallationRefEffect;
}
export interface SetupInstallationTreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: 'blob' | 'tree' | 'commit';
  readonly sha: string;
}
/** A complete non-recursive tree, never a truncated recursive projection. */
export interface SetupInstallationTree {
  readonly entries: readonly SetupInstallationTreeEntry[];
  readonly truncated: boolean;
}
export interface SetupInstallationApprovedBlob {
  readonly path: string;
  readonly sha: string | null;
  readonly mode: '100644';
}
export interface SetupInstallationSubtree {
  readonly path: string;
  readonly baseSha?: string;
  readonly preparedSha?: string;
}
