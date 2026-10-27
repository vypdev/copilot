export interface GithubProgressPullRequest {
    number?: number;
    state?: string;
    head?: { sha?: string; ref?: string; repo?: { name?: string; owner?: { login?: string } } | null };
    base?: { ref?: string; repo?: { name?: string; owner?: { login?: string } } | null };
}
/** Only native PR reads; URLs, bodies, files, refs and mutation operations are unavailable. */
export interface GithubProgressComparisonClient {
    rest: { pulls: {
        list(parameters: Record<string, unknown>): Promise<{ data: GithubProgressPullRequest[] }>;
        get(parameters: Record<string, unknown>): Promise<{ data: GithubProgressPullRequest }>;
    } };
}
