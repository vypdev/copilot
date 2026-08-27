export interface GithubRepositoryLabel {
    name: string;
    color: string;
    description?: string | null;
}
export interface GithubIssueLabelProvisioningClient {
    paginate: {
        iterator(method: (parameters: Record<string, unknown>) => Promise<{
            data: GithubRepositoryLabel[];
        }>, parameters: Record<string, unknown>): AsyncIterable<{
            data: GithubRepositoryLabel[];
        }>;
    };
    rest: {
        issues: {
            listLabelsForRepo(parameters: Record<string, unknown>): Promise<{
                data: GithubRepositoryLabel[];
            }>;
            createLabel(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}
