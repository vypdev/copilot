import type { SetupConfiguration, SetupRemoteConfiguration } from '../../domain/setup';
import type { SetupBatchFile, SetupBatchGrant, SetupBatchOperation, SetupBatchPlan, SetupBatchSharedResource,
  SetupBatchTarget, SetupBatchCandidate, SetupBatchTargetPlan, SetupBatchTargetReceipt } from '../../domain/setup_batch';

export interface SetupBatchDiscoveryPort {
  list(organization: string, token: string): Promise<{ readonly targets: readonly SetupBatchCandidate[]; readonly truncated: boolean }>;
  resolve(organization: string, repository: string, token: string): Promise<SetupBatchTarget>;
}
export interface SetupBatchInventoryPort {
  /** Undefined means access could not establish branch existence; it is never absence. */
  branchExists(target: SetupBatchTarget, branch: string, token: string): Promise<boolean | undefined>;
  shared(organization: string, token: string): Promise<readonly SetupBatchSharedResource[]>;
  effective(target: SetupBatchTarget, token: string): Promise<SetupRemoteConfiguration>;
  files(target: SetupBatchTarget, token: string): Promise<readonly SetupBatchFile[]>;
}
export interface SetupBatchRenderPort {
  review?(configuration: SetupConfiguration, existing: readonly SetupBatchFile[]): Promise<import('../../domain/setup_runner').SetupInstallationReview>;
  render(configuration: SetupConfiguration, existing: readonly SetupBatchFile[]): Promise<readonly SetupBatchFile[]>;
  digest(value: string): string;
  operationId(): string;
}
export interface SetupBatchJournalPort {
  load(operationId: string): Promise<SetupBatchOperation | undefined>;
  save(operation: SetupBatchOperation): Promise<void>;
  lock(operationId: string): Promise<() => Promise<void>>;
}
export interface SetupBatchApplyPort {
  /** Freshly inspect identity, exact base, authority, shared metadata and effective overrides. */
  revalidate(plan: SetupBatchTargetPlan, token: string, completed: SetupBatchTargetReceipt['effects']): Promise<boolean>;
  grant(plan: SetupBatchTargetPlan, grant: SetupBatchGrant, token: string): Promise<void>;
  variables(plan: SetupBatchTargetPlan, token: string): Promise<void>;
  labels(plan: SetupBatchTargetPlan, token: string): Promise<void>;
  issueTypes(plan: SetupBatchTargetPlan, token: string): Promise<void>;
  prepareCommit(plan: SetupBatchTargetPlan, operationId: string, token: string): Promise<string>;
  /** Create once or inspect and adopt only the exact prepared commit and receipt. */
  branch(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string): Promise<void>;
  /** Inspect the exact marker before creation and after an uncertain response. */
  pullRequest(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string): Promise<number>;
}
export interface SetupBatchPresentationPort {
  review(plan: SetupBatchPlan, operation: SetupBatchOperation): Promise<boolean>;
  progress(operation: SetupBatchOperation): void;
  active(): boolean;
}
