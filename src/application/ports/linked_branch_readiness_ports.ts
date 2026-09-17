/** Remote evidence for one exact issue-linked branch. Names supplied by the event are not evidence. */
export interface LinkedBranchEvidence {
  readonly name: string;
  readonly headSha: string;
}

export interface LinkedBranchReadinessPort {
  getLinkedBranch(owner: string, repository: string, issueNumber: number, branchName: string, token: string): Promise<LinkedBranchEvidence | undefined>;
}

export interface BoundLinkedBranchReadinessPort {
  getLinkedBranch(issueNumber: number, branchName: string): Promise<LinkedBranchEvidence | undefined>;
}
