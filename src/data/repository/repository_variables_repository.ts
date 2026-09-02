import type { SetupRepositoryConfigurationReadPort, SetupRepositorySecretsPort, SetupRepositoryVariablesPort } from '../../application/ports/setup_wizard_ports';
import type { SetupCredentialValue } from '../../domain/setup';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubRepositoryVariablesClient } from '../../infrastructure/github/ports/github_repository_variables_protocol';
import nacl from 'tweetnacl';
import { createHash } from 'node:crypto';

export class RepositoryVariablesRepository implements SetupRepositoryVariablesPort, SetupRepositorySecretsPort, SetupRepositoryConfigurationReadPort {
    constructor(private readonly githubClient: GithubClientPort<GithubRepositoryVariablesClient>) {}

    async list(owner: string, repository: string, token: string): Promise<readonly string[]> {
        const client = this.githubClient.getClient(token);
        if (!client.rest.secrets) throw new Error('GitHub repository Secret API is unavailable.');
        const response = await client.rest.secrets.listRepoSecrets({ owner, repo: repository, per_page: 100 });
        return response.data.secrets.map(secret => secret.name);
    }

    async listVariables(owner: string, repository: string, token: string): Promise<readonly { name: string; value?: string }[]> {
        const client = this.githubClient.getClient(token);
        const response = await client.rest.actions.listRepoVariables({ owner, repo: repository, per_page: 100 });
        return response.data.variables.map(variable => ({ name: variable.name, value: variable.value }));
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
        const existing = await client.rest.actions.listRepoVariables({ owner, repo: repository, per_page: 100 });
        const existingValues = new Map(existing.data.variables.map(variable => [variable.name, variable.value]));
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
