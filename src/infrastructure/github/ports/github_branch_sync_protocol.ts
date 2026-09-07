export interface GithubBranchSyncIssueNode {
  readonly number: number;
  readonly body?: string | null;
  readonly linkedBranches?: {
    readonly nodes?: Array<{ readonly ref?: { readonly name?: string | null } | null } | null> | null;
  } | null;
}

export interface GithubBranchSyncPullRequestNode {
  readonly number: number;
  readonly body?: string | null;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly closingIssuesReferences?: {
    readonly nodes?: Array<{ readonly number: number } | null> | null;
  } | null;
}

export interface GithubOpenBranchSyncResponse {
  readonly repository?: {
    readonly issues?: {
      readonly nodes?: Array<GithubBranchSyncIssueNode | null> | null;
      readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor?: string | null };
    } | null;
    readonly pullRequests?: {
      readonly nodes?: Array<GithubBranchSyncPullRequestNode | null> | null;
      readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor?: string | null };
    } | null;
  } | null;
}

export interface GithubBranchSyncConversationResponse {
  readonly repository?: {
    readonly issueOrPullRequest?: (
      | ({ readonly __typename: "Issue" } & GithubBranchSyncIssueNode)
      | ({ readonly __typename: "PullRequest" } & GithubBranchSyncPullRequestNode)
    ) | null;
  } | null;
}
