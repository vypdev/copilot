export interface GithubChecksClient {
    rest: {
        checks: {
            create(parameters: Record<string, unknown>): Promise<{ data: { id: number } }>;
            update?(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}
