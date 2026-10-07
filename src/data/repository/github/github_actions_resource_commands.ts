import type { SetupCredentialValue, SetupResourceTarget, SetupVariable, SetupVariablesWriteResult, SetupVariableWriteFailure } from '../../../domain/setup';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubRepositoryVariablesClient } from '../../../infrastructure/github/ports/github_repository_variables_protocol';
import { encryptSecret } from '../../../infrastructure/github_secret_encryption';
import { listCollection } from './github_actions_resource_collection';
import { getGithubErrorStatus, isGithubRateLimited } from './github_error_policy';

/** GitHub Actions Secret encryption and scope-preserving resource writes. */
export class GithubActionsResourceCommands {
    constructor(private readonly githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {}

    async upsertSecrets(
        owner: string,
        repository: string,
        token: string,
        credentials: readonly SetupCredentialValue[],
    ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
        const client = this.githubClient.getClient(token);
        const actions = client.rest.actions;
        if (!actions.listRepoSecrets || !actions.getRepoPublicKey || !actions.createOrUpdateRepoSecret) {
            throw new Error('GitHub repository Secret API is unavailable.');
        }
        const existing = new Set((await listCollection(client, actions.listRepoSecrets,
            { owner, repo: repository, per_page: 100 }, 'secrets')).map(secret => secret.name));
        const publicKey = await actions.getRepoPublicKey({ owner, repo: repository });
        let created = 0;
        let updated = 0;
        const skipped = 0;
        const errors: string[] = [];
        for (const credential of credentials) {
            try {
                await actions.createOrUpdateRepoSecret({
                    owner,
                    repo: repository,
                    secret_name: credential.name,
                    encrypted_value: await encryptSecret(credential.value, publicKey.data.key),
                    key_id: publicKey.data.key_id,
                });
                if (existing.has(credential.name)) updated += 1;
                else created += 1;
            } catch {
                errors.push(`Unable to configure repository Secret ${credential.name}.`);
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
        const secrets = client.rest.actions;
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
                if (visibility === 'selected' && (target.repositoryId === undefined || !secrets.addSelectedRepoToOrgSecret)) {
                    throw new Error('Selected organization Secret access cannot be granted to this repository.');
                }
                await secrets.createOrUpdateOrgSecret({
                    org: owner,
                    secret_name: credential.name,
                    encrypted_value: await encryptSecret(credential.value, publicKey.data.key),
                    key_id: publicKey.data.key_id,
                    visibility,
                    ...(visibility === 'selected' && !current
                        ? { selected_repository_ids: [target.repositoryId] }
                        : {}),
                });
                if (visibility === 'selected') {
                    await secrets.addSelectedRepoToOrgSecret!({ org: owner, secret_name: credential.name, repository_id: target.repositoryId });
                }
                if (current) updated += 1;
                else created += 1;
            } catch {
                errors.push(`Unable to configure organization Secret ${credential.name}.`);
            }
        }
        return { created, updated, skipped: 0, errors };
    }

    async upsert(
        owner: string,
        repository: string,
        token: string,
        variables: readonly { name: string; value: string }[],
    ): Promise<SetupVariablesWriteResult> {
        const client = this.githubClient.getClient(token);
        const existingVariables = await listCollection(client, client.rest.actions.listRepoVariables, { owner, repo: repository, per_page: 100 }, 'variables');
        const existingValues = new Map(existingVariables.map(variable => [variable.name, variable.value]));
        let created = 0;
        let updated = 0;
        const errors: string[] = [];
        const failures: SetupVariableWriteFailure[] = [];

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
                failures.push(variableWriteFailure(variable.name, 'repository', existingValues.has(variable.name) ? 'update' : 'create', error));
                errors.push(`Unable to configure repository Variable ${variable.name}.`);
            }
        }
        return { created, updated, errors, ...(failures.length ? { failures } : {}) };
    }

    async upsertScopedVariables(
        owner: string,
        repository: string,
        token: string,
        target: SetupResourceTarget,
        variables: readonly SetupVariable[],
    ): Promise<SetupVariablesWriteResult> {
        if (target.scope === 'repository') return this.upsert(owner, repository, token, variables);
        const client = this.githubClient.getClient(token);
        const actions = client.rest.actions;
        if (!actions.listOrgVariables || !actions.createOrgVariable || !actions.updateOrgVariable) {
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
        const failures: SetupVariableWriteFailure[] = [];
        for (const variable of variables) {
            let phase: SetupVariableWriteFailure['phase'] = existing.has(variable.name) ? 'update' : 'create';
            try {
                const current = existing.get(variable.name);
                const visibility = current?.visibility ?? target.organizationVisibility;
                if (visibility === 'selected' && (target.repositoryId === undefined || !actions.addSelectedRepoToOrgVariable)) {
                    throw new Error('Selected organization Variable access cannot be granted to this repository.');
                }
                const write = current ? actions.updateOrgVariable : actions.createOrgVariable;
                await write({
                    org: owner,
                    name: variable.name,
                    value: variable.value,
                    ...(!current ? { visibility } : {}),
                    ...(visibility === 'selected' && !current
                        ? { selected_repository_ids: [target.repositoryId] }
                        : {}),
                });
                if (visibility === 'selected') {
                    phase = 'repository-access';
                    await actions.addSelectedRepoToOrgVariable!({ org: owner, name: variable.name, repository_id: target.repositoryId });
                }
                if (current) updated += 1;
                else created += 1;
            } catch (error) {
                failures.push(variableWriteFailure(variable.name, 'organization', phase, error));
                errors.push(`Unable to configure organization Variable ${variable.name}.`);
            }
        }
        return { created, updated, errors, ...(failures.length ? { failures } : {}) };
    }
}

function variableWriteFailure(
    name: string, scope: SetupVariableWriteFailure['scope'], phase: SetupVariableWriteFailure['phase'], error: unknown,
): SetupVariableWriteFailure {
    const status = getGithubErrorStatus(error);
    const reason = isGithubRateLimited(error) ? 'rate-limited'
        : status === 401 || status === 403 ? 'authorization'
        : status === 400 || status === 422 ? 'invalid-input'
            : status === 409 ? 'conflict'
                : 'unavailable';
    return { name, scope, phase, reason };
}
