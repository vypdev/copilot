export interface GithubRepositoryVariable {
    name: string;
    value?: string;
}

export interface GithubRepositoryVariablesClient {
    rest: {
        actions: {
            listRepoVariables(parameters: Record<string, unknown>): Promise<{ data: { variables: GithubRepositoryVariable[] } }>;
            createRepoVariable(parameters: Record<string, unknown>): Promise<unknown>;
            updateRepoVariable(parameters: Record<string, unknown>): Promise<unknown>;
        };
        secrets?: {
            listRepoSecrets(parameters: Record<string, unknown>): Promise<{ data: { secrets: GithubRepositorySecret[] } }>;
            getRepoPublicKey(parameters: Record<string, unknown>): Promise<{ data: { key_id: string; key: string } }>;
            createOrUpdateRepoSecret(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}

export interface GithubRepositorySecret {
    name: string;
    created_at?: string;
    updated_at?: string;
}
