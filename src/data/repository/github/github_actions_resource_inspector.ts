import type { SetupRemoteConfiguration, SetupVariable } from '../../../domain/setup';
import { SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE } from '../../../domain/setup_workflow_catalog';
import { isSafeBranchTree } from '../../../domain/deployment_configuration';
import { isGithubNotFound } from './github_error_policy';
import { inspectCredentialHealthWorkflowAtRef, inspectMissingCredentialHealthWorkflow } from './credential_health_workflow_visibility';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubOrganizationResource, GithubRepositoryVariablesClient } from '../../../infrastructure/github/ports/github_repository_variables_protocol';
import { listCollection } from './github_actions_resource_collection';

/** Read-only GitHub Actions metadata and effective repository inventory. */
export class GithubActionsResourceInspector {
    constructor(private readonly githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {}

    inspectCredentialHealthWorkflow(owner: string, repository: string, token: string, ref: string) {
        const client = this.githubClient.getClient(token);
        return inspectCredentialHealthWorkflowAtRef(client.rest.repos?.getContent, owner, repository, ref);
    }

    async list(owner: string, repository: string, token: string): Promise<readonly string[]> {
        const client = this.githubClient.getClient(token);
        if (!client.rest.actions.listRepoSecrets) throw new Error('GitHub repository Secret API is unavailable.');
        const secrets = await listCollection(client, client.rest.actions.listRepoSecrets, { owner, repo: repository, per_page: 100 }, 'secrets');
        return secrets.map(secret => secret.name);
    }

    async listVariables(owner: string, repository: string, token: string): Promise<readonly { name: string; value?: string }[]> {
        const client = this.githubClient.getClient(token);
        const variables = await listCollection(client, client.rest.actions.listRepoVariables, { owner, repo: repository, per_page: 100 }, 'variables');
        return variables.map(variable => ({ name: variable.name, ...(variable.value !== undefined ? { value: variable.value } : {}) }));
    }

    async inspect(owner: string, repository: string, token: string): Promise<SetupRemoteConfiguration> {
        const client = this.githubClient.getClient(token);
        if (!client.rest.repos?.get) throw new Error('GitHub repository metadata API is unavailable.');
        const repositoryResponse = await client.rest.repos.get({ owner, repo: repository });
        const metadata = repositoryResponse.data;
        const ownerType = normalizeOwnerType(metadata.owner?.type);
        const repositoryVisibility = normalizeRepositoryVisibility(metadata.visibility);
        const repositorySecretsResult = await this.listRepositorySecretsForInspection(client, owner, repository);
        const repositoryVariablesResult = await this.listRepositoryVariablesForInspection(client, owner, repository);
        const organizationSecretsResult = await this.listOrganizationSecrets(client, owner, repository, ownerType);
        const organizationVariablesResult = await this.listOrganizationVariables(client, owner, repository, ownerType);
        const credentialHealthWorkflow = await this.inspectDefaultCredentialHealthWorkflow(client, owner, repository);
        return {
            ownerType,
            ...(typeof metadata.default_branch === 'string' && isSafeBranchTree(metadata.default_branch)
                ? { defaultBranch: metadata.default_branch } : {}),
            repositoryId: metadata.id,
            repositoryVisibility,
            repositorySecrets: repositorySecretsResult.resources,
            repositorySecretsAccess: repositorySecretsResult.access,
            organizationSecrets: organizationSecretsResult.resources.map(resource => resource.name),
            repositoryVariables: repositoryVariablesResult.resources,
            repositoryVariablesAccess: repositoryVariablesResult.access,
            organizationVariables: organizationVariablesResult.resources
                .filter((resource): resource is GithubOrganizationResource & { value: string } => resource.value !== undefined)
                .map(resource => ({ name: resource.name, value: resource.value })),
            organizationAccess: combineOrganizationAccess(organizationSecretsResult.access, organizationVariablesResult.access),
            organizationSecretsAccess: organizationSecretsResult.access,
            organizationVariablesAccess: organizationVariablesResult.access,
            credentialHealthWorkflow,
        };
    }

    private async inspectDefaultCredentialHealthWorkflow(
        client: GithubRepositoryVariablesClient,
        owner: string,
        repository: string,
    ): Promise<NonNullable<SetupRemoteConfiguration['credentialHealthWorkflow']>> {
        if (!client.rest.actions.getWorkflow) return 'unknown';
        try {
            await client.rest.actions.getWorkflow({
                owner,
                repo: repository,
                workflow_id: SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE,
            });
            return 'installed';
        } catch (error) {
            if (!isGithubNotFound(error)) return 'unavailable';
            return inspectMissingCredentialHealthWorkflow(client.rest.repos?.getContent, owner, repository);
        }
    }

    private async listRepositorySecretsForInspection(
        client: GithubRepositoryVariablesClient,
        owner: string,
        repository: string,
    ): Promise<{ resources: string[]; access: NonNullable<SetupRemoteConfiguration['repositorySecretsAccess']> }> {
        const list = client.rest.actions.listRepoSecrets;
        if (!list) return { resources: [], access: 'unknown' };
        try {
            const resources = await listCollection(client, list, { owner, repo: repository, per_page: 100 }, 'secrets');
            return { resources: resources.map(secret => secret.name), access: 'available' };
        } catch {
            return { resources: [], access: 'unavailable' };
        }
    }

    private async listRepositoryVariablesForInspection(
        client: GithubRepositoryVariablesClient,
        owner: string,
        repository: string,
    ): Promise<{ resources: SetupVariable[]; access: NonNullable<SetupRemoteConfiguration['repositoryVariablesAccess']> }> {
        try {
            const resources = (await listCollection(
                client,
                client.rest.actions.listRepoVariables,
                { owner, repo: repository, per_page: 100 },
                'variables',
            ))
                .filter((variable): variable is SetupVariable => variable.value !== undefined)
                .map(variable => ({ name: variable.name, value: variable.value }));
            return { resources, access: 'available' };
        } catch {
            return { resources: [], access: 'unavailable' };
        }
    }

    private async listOrganizationSecrets(
        client: GithubRepositoryVariablesClient,
        owner: string,
        repository: string,
        ownerType: SetupRemoteConfiguration['ownerType'],
    ): Promise<{ resources: GithubOrganizationResource[]; access: SetupRemoteConfiguration['organizationSecretsAccess'] }> {
        if (ownerType !== 'Organization') return { resources: [], access: 'not_applicable' };
        const list = client.rest.actions.listRepoOrganizationSecrets;
        if (!list) return { resources: [], access: 'unknown' };
        try {
            return { resources: await listCollection(client, list, { owner, repo: repository, per_page: 30 }, 'secrets'), access: 'available' };
        } catch {
            return { resources: [], access: 'unavailable' };
        }
    }

    private async listOrganizationVariables(
        client: GithubRepositoryVariablesClient,
        owner: string,
        repository: string,
        ownerType: SetupRemoteConfiguration['ownerType'],
    ): Promise<{ resources: GithubOrganizationResource[]; access: SetupRemoteConfiguration['organizationVariablesAccess'] }> {
        if (ownerType !== 'Organization') return { resources: [], access: 'not_applicable' };
        const list = client.rest.actions.listRepoOrganizationVariables;
        if (!list) return { resources: [], access: 'unknown' };
        try {
            return { resources: await listCollection(client, list, { owner, repo: repository, per_page: 30 }, 'variables'), access: 'available' };
        } catch {
            return { resources: [], access: 'unavailable' };
        }
    }
}

function normalizeOwnerType(value: string | undefined): SetupRemoteConfiguration['ownerType'] {
    return value === 'Organization' ? 'Organization' : value === 'User' ? 'User' : 'Unknown';
}

function normalizeRepositoryVisibility(value: string | undefined): SetupRemoteConfiguration['repositoryVisibility'] {
    return value === 'public' || value === 'private' || value === 'internal' ? value : 'unknown';
}

function combineOrganizationAccess(
    secrets: SetupRemoteConfiguration['organizationSecretsAccess'],
    variables: SetupRemoteConfiguration['organizationVariablesAccess'],
): SetupRemoteConfiguration['organizationAccess'] {
    if (secrets === 'not_applicable' && variables === 'not_applicable') return 'not_applicable';
    if (secrets === 'available' || variables === 'available') return 'available';
    if (secrets === 'unavailable' || variables === 'unavailable') return 'unavailable';
    return 'unknown';
}
