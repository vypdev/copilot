import type { GithubRepositoryVariablesClient } from '../../../infrastructure/github/ports/github_repository_variables_protocol';

export async function listCollection<T extends { name: string }>(
    client: GithubRepositoryVariablesClient,
    method: (parameters: Record<string, unknown>) => Promise<{ data: T[] | { variables?: T[]; secrets?: T[] } }>,
    parameters: Record<string, unknown>,
    key: 'variables' | 'secrets',
): Promise<T[]> {
    let resources: unknown;
    if (client.paginate) resources = await client.paginate(method, parameters);
    else {
        const response = await method(parameters);
        resources = Array.isArray(response.data) ? response.data : response.data?.[key];
    }
    if (!Array.isArray(resources) || resources.some(item => !item || typeof item !== 'object'
        || Array.isArray(item) || typeof item.name !== 'string' || !item.name)) {
        throw new Error('GitHub Actions resource inventory returned invalid data.');
    }
    return resources;
}
