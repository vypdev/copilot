import type { SetupConfiguration, SetupRemoteConfiguration, SetupVariable } from './setup';

export const SETUP_BATCH_MAX_TARGETS = 25;
export interface SetupBatchTarget {
  readonly id: number;
  readonly ownerId: number;
  readonly owner: string;
  readonly name: string;
  readonly defaultBranch: string;
  readonly baseSha: string;
  readonly private: boolean;
  readonly archived: boolean;
  readonly disabled: boolean;
  readonly canPush: boolean;
}
export type SetupBatchCandidate = Omit<SetupBatchTarget, 'baseSha'>;
interface SetupBatchSharedResourceMetadata {
  readonly name: string;
  readonly updatedAt: string;
  readonly visibility: 'all' | 'private' | 'selected';
  readonly selectedRepositoryIds: readonly number[];
}
/** Secret values cannot be represented at the semantic boundary. */
export type SetupBatchSharedResource = SetupBatchSharedResourceMetadata & (
  | { readonly kind: 'secret'; readonly value?: never }
  | { readonly kind: 'variable'; readonly value?: string }
);
export type SetupBatchSharedMetadata =
  | Omit<Extract<SetupBatchSharedResource, { readonly kind: 'secret' }>, 'selectedRepositoryIds'>
  | Omit<Extract<SetupBatchSharedResource, { readonly kind: 'variable' }>, 'selectedRepositoryIds'>;
export interface SetupBatchGrant { readonly kind: 'variable' | 'secret'; readonly name: string; readonly repositoryId: number }
export interface SetupBatchFile { readonly path: string; readonly content: string | null }
export interface SetupBatchTargetPlan {
  readonly target: SetupBatchTarget;
  readonly configuration: SetupConfiguration;
  readonly remote: SetupRemoteConfiguration;
  readonly files: readonly SetupBatchFile[];
  readonly repositoryVariables: readonly SetupVariable[];
  readonly grants: readonly SetupBatchGrant[];
  readonly sharedSnapshot: readonly SetupBatchSharedResource[];
  readonly digest: string;
  readonly blocked: readonly string[];
}
export interface SetupBatchPlan { readonly operationId: string; readonly organization: string; readonly targets: readonly SetupBatchTargetPlan[] }
export type SetupBatchTargetStatus = 'ready' | 'blocked' | 'applying' | 'partial' | 'waiting-for-merge' | 'verification-pending' | 'unchanged' | 'cancelled';
export interface SetupBatchTargetReceipt {
  readonly repositoryId: number;
  readonly repository: string;
  readonly defaultBranch: string;
  readonly baseSha: string;
  readonly planDigest: string;
  readonly status: SetupBatchTargetStatus;
  readonly effects: readonly ('access' | 'variables' | 'labels' | 'issue-types' | 'branch' | 'pull-request')[];
  readonly preparedCommit?: string;
  readonly pullRequestNumber?: number;
  readonly reason?: 'preflight' | 'drift' | 'permission' | 'provider' | 'ownership' | 'cancelled';
}
/** Durable metadata only: no configuration values, file contents, PATs or Secret values. */
export interface SetupBatchOperation {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly organization: string;
  readonly targets: readonly SetupBatchTargetReceipt[];
}
export interface SetupBatchInstallationReceipt {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly repositoryId: number;
  readonly baseSha: string;
  readonly planDigest: string;
}
