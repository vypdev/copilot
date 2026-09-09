export interface GithubDeploymentPullRequest {
  number: number;
  node_id: string;
  body?: string | null;
  state?: string;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeable_state?: string;
  merge_commit_sha?: string | null;
  head: { ref: string; sha: string; repo?: { full_name?: string } | null };
  base: { ref: string; repo?: { full_name?: string } | null };
}

export interface GithubDeploymentClient {
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  paginate<T>(method: (parameters: Record<string, unknown>) => Promise<{ data: T[] }>, parameters: Record<string, unknown>): Promise<T[]>;
  rest: {
    pulls: {
      list(parameters: Record<string, unknown>): Promise<{ data: GithubDeploymentPullRequest[] }>;
      create(parameters: Record<string, unknown>): Promise<{ data: GithubDeploymentPullRequest }>;
      get(parameters: Record<string, unknown>): Promise<{ data: GithubDeploymentPullRequest }>;
      merge(parameters: Record<string, unknown>): Promise<{ data: { merged: boolean; sha?: string; message?: string } }>;
    };
    repos: {
      get(parameters: Record<string, unknown>): Promise<{ data: { allow_auto_merge?: boolean } }>;
      getBranchProtection(parameters: Record<string, unknown>): Promise<{ data: { required_status_checks?: { strict?: boolean } | null } }>;
      compareCommits(parameters: Record<string, unknown>): Promise<{ data: { status?: string; merge_base_commit?: { sha?: string } } }>;
      listBranches(parameters: Record<string, unknown>): Promise<{ data: Array<{ name: string }> }>;
      merge(parameters: Record<string, unknown>): Promise<{ data: { merged: boolean; sha?: string; message?: string } }>;
    };
    git: {
      getRef(parameters: Record<string, unknown>): Promise<{ data: { object: { sha: string } } }>;
      createRef(parameters: Record<string, unknown>): Promise<unknown>;
      deleteRef(parameters: Record<string, unknown>): Promise<unknown>;
    };
  };
}
