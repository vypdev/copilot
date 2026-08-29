export interface GithubPullRequestChangesClient {
  paginate: {
    iterator(
      method: (
        parameters: Record<string, unknown>,
      ) => Promise<{ data: GithubPullRequestFile[] }>,
      parameters: Record<string, unknown>,
    ): AsyncIterable<{ data: GithubPullRequestFile[] }>;
  };
  rest: {
    pulls: {
      listFiles(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubPullRequestFile[] }>;
      get(
        parameters: Record<string, unknown>,
      ): Promise<{ data: { head?: { sha?: string } } }>;
    };
  };
}

export interface GithubPullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface GithubPullRequestLifecycleClient {
  rest: {
    pulls: {
      list(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubPullRequestSummary[] }>;
      update(parameters: Record<string, unknown>): Promise<unknown>;
    };
  };
}

export interface GithubPullRequestSummary {
  number: number;
  body?: string | null;
  head?: { ref?: string | null };
}
