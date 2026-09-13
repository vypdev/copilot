import type { Result } from "../../data/model/result";

export interface RemoteBranchSyncPort {
  fetchRemoteBranches(): Promise<void>;
}

export interface CommitTagQueryPort {
  getCommitTag(tag: string | undefined): Promise<string | undefined>;
}

export interface LinkedBranchCommandPort {
  createLinkedBranch(
    owner: string,
    repository: string,
    baseBranch: string,
    newBranch: string,
    issueNumber: number,
    oid: string | undefined,
    token: string,
  ): Promise<Result[]>;
}

/** Repository-credential-bound linked-branch creation authority. */
export interface BoundLinkedBranchCommandPort {
  createLinkedBranch(
    baseBranch: string,
    newBranch: string,
    issueNumber: number,
    oid?: string,
  ): Promise<readonly Result[]>;
}

export interface BranchPropagationDelayPort {
  waitForLinkedBranch(): Promise<void>;
}
