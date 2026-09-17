import type { SddPlan } from '../../domain/pre_branch_sdd';

export interface SddCatalogCapability {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly scope: string;
  readonly owner: string;
  readonly lastVerified: string;
  readonly specs: readonly string[];
  readonly workflows: readonly string[];
  readonly entrypoints: readonly string[];
  readonly code: readonly string[];
  readonly tests: readonly string[];
  readonly documentation: readonly string[];
}

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
  loadSnapshot(baseBranch: string, token: string): Promise<SddCatalogSnapshot>;
  readSdd(baseSha: string, path: string): Promise<string | undefined>;
  validateDraft(snapshot: SddCatalogSnapshot, plan: SddPlan, markdown: string, newCapability?: SddCatalogCapability): Promise<SddPreparedDraft>;
  publish(branchName: string, prepared: SddPreparedDraft, token: string): Promise<string>;
  recoverPublished(branchName: string, preparedBaseSha: string, path: string, token: string): Promise<string | undefined>;
  verifyPublication(branchName: string, preparedBaseSha: string, commitSha: string, path: string, token: string): Promise<boolean>;
}
