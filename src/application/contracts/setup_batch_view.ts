export interface SetupBatchSelectionView {
  readonly organization: string;
  readonly currentRepositoryId: number;
  readonly candidates: readonly { readonly id: number; readonly name: string; readonly private: boolean;
    readonly unavailable?: 'archived' | 'disabled' | 'read-only' | 'access-unavailable' }[];
  readonly selectedIds: readonly number[];
  readonly discoveryStatus: 'available' | 'unavailable';
  readonly truncated: boolean;
  readonly message?: 'lookup-unavailable' | 'selection-invalid' | 'access-unavailable';
}
export type SetupBatchSelectionIntent =
  | { readonly action: 'select'; readonly selectedIds: readonly number[] }
  | { readonly action: 'resolve'; readonly selectedIds: readonly number[]; readonly name: string }
  | { readonly action: 'access'; readonly selectedIds: readonly number[] };

export interface SetupBatchView {
  readonly operationId: string;
  readonly organization: string;
  readonly phase: 'review' | 'applying' | 'result';
  readonly stopRequested?: boolean;
  readonly retryRemaining: number;
  readonly targets: readonly {
    readonly repositoryId: number;
    readonly repository: string;
    readonly installationBranch: string;
    readonly baseBranch: string;
    readonly baseSha: string;
    readonly blockers: readonly string[];
    readonly status: 'ready' | 'blocked' | 'applying' | 'partial' | 'waiting-for-merge' | 'verification-pending' | 'unchanged' | 'cancelled';
    readonly files: readonly { readonly path: string; readonly content: string | null }[];
    readonly repositoryVariables: readonly string[];
    readonly grants: readonly { readonly kind: 'variable' | 'secret'; readonly name: string }[];
    readonly permissionProbes?: readonly { readonly scope: 'repository' | 'organization'; readonly permission: string }[];
    readonly retainedSecrets: readonly string[];
    readonly completedEffects: readonly string[];
    readonly reason?: 'preflight' | 'drift' | 'permission' | 'provider' | 'ownership' | 'cancelled';
    readonly pullRequestUrl?: string;
  }[];
}
