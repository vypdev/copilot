import type { SetupRepositoryConfigurationReadPort, SetupRepositorySecretsPort, SetupRepositoryVariablesPort } from '../../application/ports/setup_wizard_ports';
import type { SetupCredentialValue } from '../../domain/setup';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import type { GithubRepositoryVariablesClient } from '../../infrastructure/github/ports/github_repository_variables_protocol';
export declare class RepositoryVariablesRepository implements SetupRepositoryVariablesPort, SetupRepositorySecretsPort, SetupRepositoryConfigurationReadPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubRepositoryVariablesClient>);
    list(owner: string, repository: string, token: string): Promise<readonly string[]>;
    listVariables(owner: string, repository: string, token: string): Promise<readonly {
        name: string;
        value?: string;
    }[]>;
    upsertSecrets(owner: string, repository: string, token: string, credentials: readonly SetupCredentialValue[]): Promise<{
        created: number;
        updated: number;
        skipped: number;
        errors: string[];
    }>;
    /** Alias kept separate from Variables so callers cannot accidentally mix the two operations. */
    upsert(owner: string, repository: string, token: string, variables: readonly {
        name: string;
        value: string;
    }[]): Promise<{
        created: number;
        updated: number;
        errors: string[];
    }>;
    private upsertVariables;
}
/** GitHub requires a sealed box: ephemeral public key + crypto_box ciphertext. */
export declare function encryptSecret(value: string, base64PublicKey: string): string;
