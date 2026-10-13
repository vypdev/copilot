/** Provider DTOs remain unknown until the bound repository adapter verifies them. */
export interface GithubIssueCompletionClient {
    rest: {
        issues: {
            get(parameters: Record<string, unknown>): Promise<{ data: unknown; url: string }>;
            update(parameters: Record<string, unknown>): Promise<unknown>;
            addLabels(parameters: Record<string, unknown>): Promise<unknown>;
            removeLabel(parameters: Record<string, unknown>): Promise<unknown>;
        };
        pulls: {
            get(parameters: Record<string, unknown>): Promise<{ data: unknown; url: string }>;
        };
    };
}
