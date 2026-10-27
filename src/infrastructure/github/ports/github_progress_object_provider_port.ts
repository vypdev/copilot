/** Read-only immutable Git objects. No refs, workspace, write or execution capability. */
export interface GithubProgressObjectClient {
    rest: { git: {
        getCommit(parameters: Record<string, unknown>): Promise<{ data: { sha: string; tree: { sha: string } } }>;
        getTree(parameters: Record<string, unknown>): Promise<{ data: { sha: string; truncated: boolean; tree: Array<{ path?: string; type?: string; mode?: string; sha?: string; size?: number }> } }>;
        getBlob(parameters: Record<string, unknown>): Promise<{ data: { sha: string; size: number; encoding: string; content: string } }>;
    } };
}
