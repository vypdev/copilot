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

export interface BranchPropagationDelayPort {
  waitForLinkedBranch(): Promise<void>;
}
