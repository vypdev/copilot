export interface GithubBranchComparisonClient {
    rest: {
        repos: {
            compareCommits(parameters: Record<string, unknown>): Promise<{ data: {
                ahead_by: number;
                behind_by: number;
                total_commits: number;
                files?: Array<{ filename: string; status: string; additions?: number; deletions?: number; changes?: number; blob_url: string; raw_url: string; contents_url: string; patch?: string }>;
                commits: Array<{ sha: string; commit: { message: string; author?: { name?: string; email?: string; date?: string } } }>;
            } }>;
        };
    };
}

export interface GithubBranchClient {
    rest: {
        repos: {
            listBranches(parameters: Record<string, unknown>): Promise<{ data: Array<{ name: string }> }>;
        };
        git: {
            getRef(parameters: Record<string, unknown>): Promise<{ data: { ref: string } }>;
            deleteRef(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}

export interface GithubBranchMergeClient {
    rest: {
        pulls: {
            create(parameters: Record<string, unknown>): Promise<{ data: { number: number } }>;
            listCommits(parameters: Record<string, unknown>): Promise<{ data: Array<{ commit: { message: string } }> }>;
            update(parameters: Record<string, unknown>): Promise<unknown>;
            merge(parameters: Record<string, unknown>): Promise<{ data: { merged: boolean; message?: string } }>;
        };
        checks: {
            listForRef(parameters: Record<string, unknown>): Promise<{ data: { check_runs: Array<{ status: string; conclusion: string | null; name: string; pull_requests?: Array<{ number: number }> }> } }>;
        };
        repos: {
            getCombinedStatusForRef(parameters: Record<string, unknown>): Promise<{ data: { state: string; statuses: Array<{ context: string; state: string }> } }>;
            merge(parameters: Record<string, unknown>): Promise<{ data: { merged: boolean; message?: string } }>;
        };
    };
}
