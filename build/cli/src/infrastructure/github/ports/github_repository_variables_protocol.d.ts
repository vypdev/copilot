export interface GithubRepositoryVariable {
    name: string;
    value?: string;
}
export interface GithubOrganizationResource {
    name: string;
    value?: string;
    visibility?: 'all' | 'private' | 'selected';
    selected_repositories_url?: string;
}
export interface GithubRepositoryMetadata {
    id?: number;
    visibility?: string;
    owner?: {
        type?: string;
    };
}
export interface GithubActionsPublicKey {
    key_id: string;
    key: string;
}
export interface GithubRepositoryVariablesClient {
    rest: {
        repos?: {
            get(parameters: Record<string, unknown>): Promise<{
                data: GithubRepositoryMetadata;
            }>;
        };
        actions: {
            listRepoVariables(parameters: Record<string, unknown>): Promise<{
                data: {
                    variables: GithubRepositoryVariable[];
                };
            }>;
            createRepoVariable(parameters: Record<string, unknown>): Promise<unknown>;
            updateRepoVariable(parameters: Record<string, unknown>): Promise<unknown>;
            listRepoOrganizationVariables?: (parameters: Record<string, unknown>) => Promise<{
                data: {
                    variables: GithubOrganizationResource[];
                };
            }>;
            listOrgVariables?: (parameters: Record<string, unknown>) => Promise<{
                data: {
                    variables: GithubOrganizationResource[];
                };
            }>;
            createOrUpdateOrgVariable?: (parameters: Record<string, unknown>) => Promise<unknown>;
            addSelectedRepoToOrgVariable?: (parameters: Record<string, unknown>) => Promise<unknown>;
        };
        secrets?: {
            listRepoSecrets(parameters: Record<string, unknown>): Promise<{
                data: {
                    secrets: GithubRepositorySecret[];
                };
            }>;
            getRepoPublicKey(parameters: Record<string, unknown>): Promise<{
                data: GithubActionsPublicKey;
            }>;
            createOrUpdateRepoSecret(parameters: Record<string, unknown>): Promise<unknown>;
            listRepoOrganizationSecrets?: (parameters: Record<string, unknown>) => Promise<{
                data: {
                    secrets: GithubOrganizationResource[];
                };
            }>;
            listOrgSecrets?: (parameters: Record<string, unknown>) => Promise<{
                data: {
                    secrets: GithubOrganizationResource[];
                };
            }>;
            getOrgPublicKey?: (parameters: Record<string, unknown>) => Promise<{
                data: GithubActionsPublicKey;
            }>;
            createOrUpdateOrgSecret?: (parameters: Record<string, unknown>) => Promise<unknown>;
            addSelectedRepoToOrgSecret?: (parameters: Record<string, unknown>) => Promise<unknown>;
        };
    };
    paginate?: <T>(method: (parameters: Record<string, unknown>) => Promise<{
        data: T[] | {
            variables?: T[];
            secrets?: T[];
        };
    }>, parameters: Record<string, unknown>) => Promise<T[]>;
}
export interface GithubRepositorySecret {
    name: string;
    created_at?: string;
    updated_at?: string;
}
