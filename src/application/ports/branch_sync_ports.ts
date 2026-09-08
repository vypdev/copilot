export interface BranchDependency {
  readonly issueNumber: number;
  readonly parentBranch: string;
  readonly workingBranch: string;
}

export interface BranchSyncTarget extends BranchDependency {
  /** The issue or pull-request conversation where the command was requested. */
  readonly conversationNumber: number;
}

export interface BranchDependencyQueryPort {
  listOpenDependencies(
    owner: string,
    repository: string,
    token: string,
  ): Promise<BranchDependency[]>;
  resolveTarget(
    owner: string,
    repository: string,
    conversationNumber: number,
    token: string,
  ): Promise<BranchSyncTarget | undefined>;
}

export interface BranchSyncComparison {
  readonly aheadBy: number;
  readonly behindBy: number;
}

export interface BranchSyncComparisonPort {
  compare(
    owner: string,
    repository: string,
    parentBranch: string,
    workingBranch: string,
    token: string,
  ): Promise<BranchSyncComparison>;
}

export interface BranchSyncNotificationComment {
  readonly id: number;
  readonly body: string | null;
  readonly user?: { readonly login?: string };
}

export interface BranchSyncNotificationPort {
  listIssueComments(
    owner: string,
    repository: string,
    issueNumber: number,
    token: string,
  ): Promise<BranchSyncNotificationComment[]>;
  addComment(
    owner: string,
    repository: string,
    issueNumber: number,
    comment: string,
    token: string,
  ): Promise<void>;
  updateComment(
    owner: string,
    repository: string,
    issueNumber: number,
    commentId: number,
    comment: string,
    token: string,
  ): Promise<void>;
}

export type BranchMergePreparation =
  | {
      readonly kind: "aligned";
      readonly parentSha: string;
      readonly childSha: string;
    }
  | {
      readonly kind: "clean";
      readonly parentSha: string;
      readonly childSha: string;
    }
  | {
      readonly kind: "conflicted";
      readonly parentSha: string;
      readonly childSha: string;
      readonly conflictPaths: readonly string[];
    };

export interface BranchSyncResolutionValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface BranchSyncWorkspacePort {
  prepare(
    parentBranch: string,
    workingBranch: string,
    token: string,
  ): Promise<BranchMergePreparation>;
  validatePreparedMerge(
    conflictPaths: readonly string[],
  ): Promise<BranchSyncResolutionValidation>;
  assertRemoteHeadsUnchanged(
    parentBranch: string,
    parentSha: string,
    workingBranch: string,
    childSha: string,
    token: string,
  ): Promise<BranchSyncResolutionValidation>;
  commitAndPush(
    workingBranch: string,
    message: string,
    author: { readonly name: string; readonly email: string },
    token: string,
  ): Promise<string>;
  abort(): Promise<void>;
}
