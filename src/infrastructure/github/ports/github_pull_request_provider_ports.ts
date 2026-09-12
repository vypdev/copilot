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
      get?(parameters: Record<string, unknown>): Promise<{ data: {
        number?: number;
        state?: string;
        body?: string | null;
        head?: {
          ref?: string | null;
          sha?: string | null;
          repo?: { owner?: { login?: string | null } | null } | null;
        };
        base?: {
          ref?: string | null;
          repo?: {
            id?: number;
            name?: string | null;
            owner?: { login?: string | null } | null;
          } | null;
        };
      } }>;
    };
  };
}

export interface GithubPullRequestSummary {
  number: number;
  state?: string;
  body?: string | null;
  head?: {
    ref?: string | null;
    sha?: string | null;
    repo?: { owner?: { login?: string | null } | null } | null;
  };
  base?: {
    repo?: {
      id?: number;
      name?: string | null;
      owner?: { login?: string | null } | null;
    } | null;
  };
}
