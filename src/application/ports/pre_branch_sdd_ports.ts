import type { SddPlan } from '../../domain/pre_branch_sdd';

import type { SddCatalogCapability } from '../../domain/sdd_catalog_compatibility';
export type { SddCatalogCapability } from '../../domain/sdd_catalog_compatibility';

export interface SddCatalogSnapshot {
  readonly baseSha: string;
  readonly capabilities: readonly SddCatalogCapability[];
  readonly template: string;
  readonly standard: string;
}

export interface SddPreparedDraft {
  readonly plan: SddPlan;
  readonly baseSha: string;
  readonly markdown: string;
  readonly catalogJson?: string;
  readonly catalogMarkdown?: string;
  readonly changedPaths: readonly string[];
}

/** The Action owns all Git and file writes; the drafting agent has read-only structured access. */
export interface PreBranchSddWorkspacePort {
  loadSnapshot(baseBranch: string): Promise<SddCatalogSnapshot>;
  /** Reads freshness even when the selected catalog profile cannot be loaded. */
  readSourceRevision?(baseBranch: string): Promise<string>;
  isAncestor(ancestorSha: string, descendantSha: string): Promise<boolean>;
  readSdd(baseSha: string, path: string): Promise<string | undefined>;
  validateDraft(snapshot: SddCatalogSnapshot, plan: SddPlan, markdown: string, newCapability?: SddCatalogCapability): Promise<SddPreparedDraft>;
  publish(branchName: string, prepared: SddPreparedDraft): Promise<string>;
  recoverPublished(branchName: string, prepared: SddPreparedDraft): Promise<string | undefined>;
  verifyPublication(branchName: string, preparedBaseSha: string, commitSha: string, path: string): Promise<boolean>;
}
