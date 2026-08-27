export interface GithubLinkedBranchContextResponse {
  repository: {
    id: string;
    issue: { id: string } | null;
    ref: {
      target: {
        oid: string;
      } | null;
    } | null;
  } | null;
}

export interface GithubLinkedBranchMutationResponse {
  createLinkedBranch: {
    linkedBranch: {
      id: string;
      ref: {
        name: string;
      } | null;
    } | null;
  } | null;
}
