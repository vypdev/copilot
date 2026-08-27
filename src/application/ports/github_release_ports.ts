export interface GithubReleaseClient {
    rest: {
        git: {
            getRef(parameters: Record<string, unknown>): Promise<{ data: { object: { sha: string } } }>;
            updateRef(parameters: Record<string, unknown>): Promise<unknown>;
            createRef(parameters: Record<string, unknown>): Promise<unknown>;
        };
        repos: {
            getReleaseByTag(parameters: Record<string, unknown>): Promise<{ data: { name?: string | null; body?: string | null; draft: boolean; prerelease: boolean } }>;
            listReleases(parameters: Record<string, unknown>): Promise<{ data: Array<{ id: number; tag_name: string }> }>;
            updateRelease(parameters: Record<string, unknown>): Promise<unknown>;
            createRelease(parameters: Record<string, unknown>): Promise<{ data: { id: number; html_url: string } }>;
            get(parameters: Record<string, unknown>): Promise<{ data: { default_branch: string } }>;
        };
    };
}


