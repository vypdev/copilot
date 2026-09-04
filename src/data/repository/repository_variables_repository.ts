import type {
    SetupRemoteConfigurationReadPort,
    SetupRepositoryConfigurationReadPort,
    SetupRepositorySecretsPort,
    SetupRepositoryVariablesPort,
} from '../../application/ports/setup_wizard_ports';
import type { SetupCredentialValue, SetupRemoteConfiguration, SetupResourceTarget, SetupVariable } from '../../domain/setup';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type {
    GithubOrganizationResource,
    GithubRepositoryVariablesClient,
} from '../../infrastructure/github/ports/github_repository_variables_protocol';
import nacl from 'tweetnacl';
import { createHash } from 'node:crypto';

export class RepositoryVariablesRepository implements SetupRepositoryVariablesPort, SetupRepositorySecretsPort, SetupRepositoryConfigurationReadPort, SetupRemoteConfigurationReadPort {
    constructor(private readonly githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {}

    async list(owner: string, repository: string, token: string): Promise<readonly string[]> {
        const client = this.githubClient.getClient(token);
        if (!client.rest.secrets) throw new Error('GitHub repository Secret API is unavailable.');
        const secrets = await listCollection(client, client.rest.secrets.listRepoSecrets, { owner, repo: repository, per_page: 100 }, 'secrets');
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
        const repositorySecrets = client.rest.secrets
            ? await this.list(owner, repository, token)
            : [];
        const repositoryVariables = (await this.listVariables(owner, repository, token))
            .filter((variable): variable is SetupVariable => variable.value !== undefined)
            .map(variable => ({ name: variable.name, value: variable.value }));
        const organizationSecretsResult = await this.listOrganizationSecrets(client, owner, repository, ownerType);
        const organizationVariablesResult = await this.listOrganizationVariables(client, owner, repository, ownerType);
        return {
            ownerType,
            repositoryId: metadata.id,
            repositoryVisibility,
            repositorySecrets,
            organizationSecrets: organizationSecretsResult.resources.map(resource => resource.name),
            repositoryVariables,
            organizationVariables: organizationVariablesResult.resources
                .filter((resource): resource is GithubOrganizationResource & { value: string } => resource.value !== undefined)
                .map(resource => ({ name: resource.name, value: resource.value })),
            organizationAccess: combineOrganizationAccess(organizationSecretsResult.access, organizationVariablesResult.access),
            organizationSecretsAccess: organizationSecretsResult.access,
            organizationVariablesAccess: organizationVariablesResult.access,
        };
    }

    async upsertSecrets(
        owner: string,
        repository: string,
        token: string,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
        const client = this.githubClient.getClient(token);
        if (!client.rest.secrets) throw new Error('GitHub repository Secret API is unavailable.');
        const existing = new Set(await this.list(owner, repository, token));
        const publicKey = await client.rest.secrets.getRepoPublicKey({ owner, repo: repository });
        let created = 0;
        let updated = 0;
        const skipped = 0;
        const errors: string[] = [];
        for (const credential of credentials) {
            try {
                await client.rest.secrets.createOrUpdateRepoSecret({
                    owner,
                    repo: repository,
                    secret_name: credential.name,
                    encrypted_value: encryptSecret(credential.value, publicKey.data.key),
                    key_id: publicKey.data.key_id,
                });
                if (existing.has(credential.name)) updated += 1;
                else created += 1;
            } catch (error) {
                errors.push(`Error configuring repository Secret ${credential.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { created, updated, skipped, errors };
    }

    async upsertScopedSecrets(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
        if (target.scope === 'repository') return this.upsertSecrets(owner, repository, token, credentials);
        const client = this.githubClient.getClient(token);
        const secrets = client.rest.secrets;
        if (!secrets?.getOrgPublicKey || !secrets.createOrUpdateOrgSecret || !secrets.listOrgSecrets) {
            throw new Error('GitHub organization Secret API is unavailable or the setup PAT lacks organization Secret permissions.');
        }
        if (target.organizationVisibility === 'selected' && target.repositoryId === undefined) {
            throw new Error('The repository ID is required for selected organization Secret access.');
        }
        const existing = new Map((await listCollection(client, secrets.listOrgSecrets, { org: owner, per_page: 30 }, 'secrets'))
            .map(secret => [secret.name, secret]));
        const publicKey = await secrets.getOrgPublicKey({ org: owner });
        let created = 0;
        let updated = 0;
        const errors: string[] = [];
        for (const credential of credentials) {
            try {
                const current = existing.get(credential.name);
                const visibility = current?.visibility ?? target.organizationVisibility;
                await secrets.createOrUpdateOrgSecret({
                    org: owner,
                    secret_name: credential.name,
                    encrypted_value: encryptSecret(credential.value, publicKey.data.key),
                    key_id: publicKey.data.key_id,
                    visibility,
                    ...(visibility === 'selected' && target.repositoryId !== undefined && !current
                        ? { selected_repository_ids: [target.repositoryId] }
                        : {}),
                });
                if (visibility === 'selected' && target.repositoryId !== undefined && secrets.addSelectedRepoToOrgSecret) {
                    await secrets.addSelectedRepoToOrgSecret({ org: owner, secret_name: credential.name, repository_id: target.repositoryId });
                }
                if (current) updated += 1;
                else created += 1;
            } catch (error) {
                errors.push(`Error configuring organization Secret ${credential.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { created, updated, skipped: 0, errors };
    }

    /** Alias kept separate from Variables so callers cannot accidentally mix the two operations. */
    async upsert(
        owner: string,
        repository: string,
        token: string,
        variables: readonly { name: string; value: string }[],
    ): Promise<{ created: number; updated: number; errors: string[] }> {
        return this.upsertVariables(owner, repository, token, variables);
    }

    private async upsertVariables(
        owner: string,
        repository: string,
        token: string,
        variables: readonly { name: string; value: string }[],
    ): Promise<{ created: number; updated: number; errors: string[] }> {
        const client = this.githubClient.getClient(token);
        const existingVariables = await listCollection(client, client.rest.actions.listRepoVariables, { owner, repo: repository, per_page: 100 }, 'variables');
        const existingValues = new Map(existingVariables.map(variable => [variable.name, variable.value]));
        let created = 0;
        let updated = 0;
        const errors: string[] = [];

        for (const variable of variables) {
            try {
                if (existingValues.has(variable.name)) {
                    if (existingValues.get(variable.name) === variable.value) continue;
                    await client.rest.actions.updateRepoVariable({ owner, repo: repository, name: variable.name, value: variable.value });
                    updated += 1;
                } else {
                    await client.rest.actions.createRepoVariable({ owner, repo: repository, name: variable.name, value: variable.value });
                    created += 1;
                }
            } catch (error) {
                errors.push(`Error configuring repository Variable ${variable.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { created, updated, errors };
    }

    async upsertScopedVariables(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        variables: readonly SetupVariable[],
    ): Promise<{ created: number; updated: number; errors: string[] }> {
        if (target.scope === 'repository') return this.upsert(owner, repository, token, variables);
        const client = this.githubClient.getClient(token);
        const actions = client.rest.actions;
        if (!actions.listOrgVariables || !actions.createOrUpdateOrgVariable) {
            throw new Error('GitHub organization Variable API is unavailable or the setup PAT lacks organization Variable permissions.');
        }
        if (target.organizationVisibility === 'selected' && target.repositoryId === undefined) {
            throw new Error('The repository ID is required for selected organization Variable access.');
        }
        const existing = new Map((await listCollection(client, actions.listOrgVariables, { org: owner, per_page: 30 }, 'variables'))
            .map(variable => [variable.name, variable]));
        let created = 0;
        let updated = 0;
        const errors: string[] = [];
        for (const variable of variables) {
            try {
                const current = existing.get(variable.name);
                const visibility = current?.visibility ?? target.organizationVisibility;
                await actions.createOrUpdateOrgVariable({
                    org: owner,
                    name: variable.name,
                    value: variable.value,
                    visibility,
                    ...(visibility === 'selected' && target.repositoryId !== undefined && !current
                        ? { selected_repository_ids: [target.repositoryId] }
                        : {}),
                });
                if (visibility === 'selected' && target.repositoryId !== undefined && actions.addSelectedRepoToOrgVariable) {
                    await actions.addSelectedRepoToOrgVariable({ org: owner, name: variable.name, repository_id: target.repositoryId });
                }
                if (current) updated += 1;
                else created += 1;
            } catch (error) {
                errors.push(`Error configuring organization Variable ${variable.name}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return { created, updated, errors };
    }

    private async listOrganizationSecrets(
        client: GithubRepositoryVariablesClient,
        owner: string,
        repository: string,
        ownerType: SetupRemoteConfiguration['ownerType'],
    ): Promise<{ resources: GithubOrganizationResource[]; access: SetupRemoteConfiguration['organizationSecretsAccess'] }> {
        if (ownerType !== 'Organization') return { resources: [], access: 'not_applicable' };
        const list = client.rest.secrets?.listRepoOrganizationSecrets;
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

async function listCollection<T extends { name: string }>(
    client: GithubRepositoryVariablesClient,
    method: (parameters: Record<string, unknown>) => Promise<{ data: T[] | { variables?: T[]; secrets?: T[] } }>,
    parameters: Record<string, unknown>,
    key: 'variables' | 'secrets',
): Promise<T[]> {
    if (client.paginate) return client.paginate(method, parameters);
    const response = await method(parameters);
    return Array.isArray(response.data) ? response.data : response.data[key] ?? [];
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

/** GitHub requires a sealed box: ephemeral public key + crypto_box ciphertext. */
export function encryptSecret(value: string, base64PublicKey: string): string {
    const publicKey = Buffer.from(base64PublicKey, 'base64');
    if (publicKey.length !== nacl.box.publicKeyLength) throw new Error('GitHub returned an invalid repository public key.');
    const keyPair = nacl.box.keyPair();
    const nonce = createHash('blake2b512')
        .update(Buffer.concat([Buffer.from(keyPair.publicKey), publicKey]))
        .digest()
        .subarray(0, nacl.box.nonceLength);
    const ciphertext = nacl.box(Buffer.from(value, 'utf8'), nonce, publicKey, keyPair.secretKey);
    return Buffer.from(Buffer.concat([Buffer.from(keyPair.publicKey), Buffer.from(ciphertext)])).toString('base64');
}
